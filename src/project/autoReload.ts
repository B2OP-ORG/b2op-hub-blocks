// Auto-reload: while a program runs, edits to project files reload it (stop,
// upload changed files, run the last target again). Each kind of file has its
// own rule (Settings → Run & reload): off, after a delay since the last
// change, or when focus leaves the editor (click outside it, switch file tab,
// switch browser window).

import { useApp } from "../state/store";
import { fileMode, stripBlocksHeader, type AutoReloadSettings, type ProjectFile } from "./format";
import { isSceneFile } from "../scene/project";
import { isReloading, isSyncing, reloadProgram } from "./deviceSync";

export type ReloadKind = keyof AutoReloadSettings;

/** Kind of a project file for auto-reload, or null when its changes don't count. */
function kindOf(f: ProjectFile): ReloadKind | null {
  if (!/\.py$/i.test(f.name)) return null;
  if (isSceneFile(f)) return "scenes";
  return fileMode(f) === "blocks" ? "blocks" : "python";
}

/**
 * What counts as a change. Blocks files: the generated Python only, so moving
 * a block around doesn't reload.
 */
function changeKey(f: ProjectFile, kind: ReloadKind): string {
  return kind === "blocks" ? stripBlocksHeader(f.content) : f.content;
}

/** Elements outside the editor area that don't count as leaving it (popups that belong to the editor, run controls). */
const IGNORE_SELECTOR = [
  ".blocklyWidgetDiv", ".blocklyDropDownDiv", ".blocklyTooltipDiv",
  "[role=menu]", "[role=dialog]", "[data-autoreload-ignore]",
].join(",");

let editorArea: HTMLElement | null = null;

/** The element holding the active editor (Workspace registers it). */
export function setEditorArea(el: HTMLElement | null): void {
  editorArea = el;
}

const dirty = new Set<ReloadKind>();
const timers = new Map<ReloadKind, ReturnType<typeof setTimeout>>();
const RETRY_MS = 500;

function rules(): AutoReloadSettings {
  return useApp.getState().editorSettings.autoReload;
}

function clearAll(): void {
  dirty.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

async function reload(): Promise<void> {
  const s = useApp.getState();
  if (!s.running || !s.device) { clearAll(); return; }
  clearAll();
  // The reload uploads the files as they are now.
  const uploaded = snapshot(s.mfp.files);
  const names = changedNames(uploaded);
  s.appendConsole("info", `[auto-reload${names.length ? ": " + names.join(", ") : ""}]\n`);
  if (await reloadProgram()) baseline = uploaded;
}

function schedule(kind: ReloadKind, ms: number): void {
  const old = timers.get(kind);
  if (old) clearTimeout(old);
  timers.set(kind, setTimeout(() => {
    timers.delete(kind);
    if (!dirty.has(kind) || rules()[kind].mode !== "delay") return;
    // A transfer or another reload is busy: try again shortly.
    if (isSyncing() || isReloading()) { schedule(kind, RETRY_MS); return; }
    void reload();
  }, ms));
}

/** Focus left the editor: reload if a file whose rule is "focus" changed. */
function left(): void {
  const r = rules();
  if (![...dirty].some((k) => r[k].mode === "focus")) return;
  if (isSyncing() || isReloading()) return;
  void reload();
}

function outsideEditor(target: EventTarget | null): boolean {
  if (!(target instanceof Node) || !editorArea) return false;
  if (editorArea.contains(target)) return false;
  const el = target instanceof Element ? target : target.parentElement;
  return !el?.closest(IGNORE_SELECTOR);
}

type Keys = Map<string, { kind: ReloadKind; key: string; name: string }>;

/** Change keys of the project's files (file id → kind + key). */
function snapshot(files: ProjectFile[]): Keys {
  const next: Keys = new Map();
  for (const f of files) {
    const kind = kindOf(f);
    if (kind) next.set(f.id, { kind, key: changeKey(f, kind), name: f.name });
  }
  return next;
}

/** Keys of the files the running program was started (or last reloaded) with. */
let baseline: Keys = new Map();

/** Kinds whose files differ from the running program's (edited, added or removed). */
function kindsChanged(keys: Keys): Set<ReloadKind> {
  const out = new Set<ReloadKind>();
  for (const [id, k] of keys) if (baseline.get(id)?.key !== k.key) out.add(k.kind);
  for (const [id, k] of baseline) if (!keys.has(id)) out.add(k.kind);
  return out;
}

/** Names of the files that differ from the running program's (removed ones included). */
function changedNames(keys: Keys): string[] {
  const out: string[] = [];
  for (const [id, k] of keys) if (baseline.get(id)?.key !== k.key) out.push(k.name);
  for (const [id, k] of baseline) if (!keys.has(id)) out.push(`${k.name} (removed)`);
  return out;
}

let started = false;

/** Start watching edits and focus. Idempotent. */
export function startAutoReload(): void {
  if (started) return;
  started = true;

  let projectId = useApp.getState().mfp.id;
  let lastFiles = useApp.getState().mfp.files;
  let keys = snapshot(lastFiles);
  // Hot reload mid-run: take what's there as what's running.
  if (useApp.getState().running) baseline = keys;

  const unsub = useApp.subscribe((s, prev) => {
    if (prev.running && !s.running && !isReloading()) clearAll();
    // A program started by hand (a reload sets the baseline itself).
    if (!prev.running && s.running && !isReloading()) baseline = snapshot(s.mfp.files);
    if (s.activeFileId !== prev.activeFileId || s.activeExtraTab !== prev.activeExtraTab) left();

    const files = s.mfp.files;
    if (files === lastFiles) return;
    lastFiles = files;
    const next = snapshot(files);
    const sameProject = s.mfp.id === projectId;
    projectId = s.mfp.id;
    const old = keys;
    keys = next;
    if (!sameProject || !s.running || !s.device) return;

    // Kinds edited just now (vs the previous state)…
    const touched = new Set<ReloadKind>();
    for (const [id, k] of next) if (old.get(id)?.key !== k.key) touched.add(k.kind);
    for (const [id, k] of old) if (!next.has(id)) touched.add(k.kind);
    if (!touched.size) return;
    // …count only when they now differ from what's running: an edit that was
    // undone (or a block dragged out and back) is no change.
    const changed = kindsChanged(next);
    const r = s.editorSettings.autoReload;
    for (const kind of touched) {
      if (!changed.has(kind) || r[kind].mode === "off") {
        dirty.delete(kind);
        const t = timers.get(kind);
        if (t) { clearTimeout(t); timers.delete(kind); }
        continue;
      }
      dirty.add(kind);
      if (r[kind].mode === "delay") schedule(kind, Math.max(0, r[kind].delaySec) * 1000);
    }
  });

  const onPointer = (e: Event) => { if (outsideEditor(e.target)) left(); };
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("focusin", onPointer, true);
  window.addEventListener("blur", left);

  // Dev hot reload: the old copy must not reload the program as well.
  import.meta.hot?.dispose(() => {
    unsub();
    clearAll();
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("focusin", onPointer, true);
    window.removeEventListener("blur", left);
  });
}
