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
  s.appendConsole("info", "[auto-reload]\n");
  await reloadProgram();
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

let started = false;

/** Start watching edits and focus. Idempotent. */
export function startAutoReload(): void {
  if (started) return;
  started = true;

  let projectId = useApp.getState().mfp.id;
  let lastFiles = useApp.getState().mfp.files;
  let keys = new Map<string, string>();
  const snapshot = (files: ProjectFile[]) => {
    const next = new Map<string, string>();
    for (const f of files) {
      const k = kindOf(f);
      if (k) next.set(f.id, k + "\0" + changeKey(f, k));
    }
    return next;
  };
  keys = snapshot(lastFiles);

  useApp.subscribe((s, prev) => {
    if (prev.running && !s.running && !isReloading()) clearAll();
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

    const r = s.editorSettings.autoReload;
    for (const [id, key] of next) {
      if (old.get(id) === key) continue;
      const kind = key.slice(0, key.indexOf("\0")) as ReloadKind;
      const rule = r[kind];
      if (rule.mode === "off") continue;
      dirty.add(kind);
      if (rule.mode === "delay") schedule(kind, Math.max(0, rule.delaySec) * 1000);
    }
  });

  document.addEventListener("pointerdown", (e) => { if (outsideEditor(e.target)) left(); }, true);
  document.addEventListener("focusin", (e) => { if (outsideEditor(e.target)) left(); }, true);
  window.addEventListener("blur", left);
}
