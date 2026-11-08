// Mirrors projects into /sd/<project>/ on the hub and runs them.

import { useApp } from "../state/store";
import type { DeviceClient } from "../device/deviceClient";
import type { MultiFileProject, ProjectFile } from "./format";
import { hashContent } from "./format";
import { ancestorDirs } from "./paths";
import { sanitizeFilename } from "../utils/sanitize";
import { showAlert } from "../ui/Dialog";

export class CancelledError extends Error {
  constructor() { super("Cancelled"); }
}

/** Device folder a project uploads into. */
export function projectRoot(title: string): string {
  return "/sd/" + sanitizeFilename(title);
}

/** FAT-safe single path segment; keeps case and extension. */
export function sanitizeSegment(seg: string): string {
  const s = seg.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "_");
  return s || "_";
}

export function deviceRelPath(rel: string): string {
  return rel.split("/").map(sanitizeSegment).join("/");
}

/** Absolute device path for a project file. */
export function devicePathFor(title: string, rel: string): string {
  return projectRoot(title) + "/" + deviceRelPath(rel);
}

function isUnknownKind(e: unknown): boolean {
  return /unknown kind/i.test((e as Error)?.message ?? "");
}

/**
 * Make sure every directory in `dirs` (absolute, any order) exists. Uses LS to
 * skip existing ones so firmware without MKDIR still works for existing dirs.
 */
export async function ensureDirs(device: DeviceClient, dirs: string[]): Promise<void> {
  const all = new Set<string>();
  for (const d of dirs) {
    const segs = d.split("/").filter(Boolean);
    for (let i = 1; i <= segs.length; i++) all.add("/" + segs.slice(0, i).join("/"));
  }
  const sorted = [...all].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const listing = new Map<string, Map<string, boolean> | null>(); // parent → name → isDir
  const exists = new Set<string>(["/", "/sd"]);
  for (const dir of sorted) {
    if (exists.has(dir)) continue;
    const parent = dir.slice(0, dir.lastIndexOf("/")) || "/";
    const name = dir.slice(dir.lastIndexOf("/") + 1);
    if (!listing.has(parent)) {
      try {
        const entries = await device.ls(parent);
        listing.set(parent, new Map(entries.map((e) => [e.name, e.isDir])));
      } catch {
        listing.set(parent, null);
      }
    }
    const entries = listing.get(parent);
    const found = entries?.get(name);
    if (found === true) { exists.add(dir); continue; }
    if (found === false) throw new Error(`"${dir}" exists on the hub but is a file, not a folder.`);
    try {
      await device.mkdir(dir);
    } catch (e) {
      if (isUnknownKind(e)) {
        throw new Error(`The hub firmware doesn't support creating folders (MKDIR). Update the firmware, or create "${dir}" on the SD card manually.`);
      }
      throw new Error(`Could not create folder "${dir}": ${(e as Error).message}`);
    }
    exists.add(dir);
    listing.set(dir, new Map());
  }
}

/** Upload bytes with shared progress/cancel handling. */
export async function uploadWithProgress(
  device: DeviceClient,
  path: string,
  bytes: Uint8Array,
  label: string,
  opts: { allowRoot?: boolean; fileIndex?: number; fileCount?: number; startedAt?: number } = {},
): Promise<void> {
  const { setTransfer } = useApp.getState();
  const startedAt = opts.startedAt ?? Date.now();
  setTransfer({ label, sent: 0, total: bytes.length, startedAt, fileIndex: opts.fileIndex, fileCount: opts.fileCount });
  await device.upload(path, bytes, {
    policy: { allowRoot: opts.allowRoot ?? false },
    autoRun: false,
    onProgress: (sent, total) => {
      if (useApp.getState().transferCancel) throw new CancelledError();
      setTransfer({ label, sent, total, startedAt, fileIndex: opts.fileIndex, fileCount: opts.fileCount });
    },
  });
}

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

export interface SyncOptions {
  mode: "changed" | "all";
  /** Restrict to these file ids (still subject to `mode`). */
  onlyFileIds?: string[];
}

export interface SyncResult {
  uploaded: number;
  unchanged: number;
}

/** Files that would be uploaded by a "changed" sync. */
export function changedFiles(p: MultiFileProject, deviceName: string): ProjectFile[] {
  const hashes = p.upload && p.upload.device === deviceName ? p.upload.hashes : {};
  return p.files.filter((f) => hashes[f.name] !== hashContent(f.content));
}

/**
 * Upload a project's files to /sd/<project>/. Throws on failure; progress and
 * per-file hashes are recorded as it goes so a partial sync isn't repeated.
 */
export async function syncProject(projectId: string, opts: SyncOptions): Promise<SyncResult> {
  const st = useApp.getState();
  const device = st.device;
  if (!device) throw new Error("No hub connected.");
  const p = st.getProject(projectId);
  if (!p) throw new Error("Project not found.");
  if (syncing) throw new Error("Another transfer is in progress.");
  syncing = true;
  const deviceName = st.deviceName || "hub";
  try {
    if (!p.upload || p.upload.device !== deviceName) st.recordUpload(projectId, deviceName, {}, true);
    const pool = opts.onlyFileIds ? p.files.filter((f) => opts.onlyFileIds!.includes(f.id)) : p.files;
    const todo = opts.mode === "all" ? pool : changedFiles(p, deviceName).filter((f) => pool.includes(f));
    const root = projectRoot(p.title);

    const dirs = [root];
    for (const f of todo) for (const d of ancestorDirs(f.name)) dirs.push(root + "/" + deviceRelPath(d));
    if (opts.mode === "all" && !opts.onlyFileIds) for (const d of p.folders) dirs.push(root + "/" + deviceRelPath(d));
    await ensureDirs(device, dirs);

    const startedAt = Date.now();
    let i = 0;
    for (const f of todo) {
      i++;
      const path = devicePathFor(p.title, f.name);
      const bytes = new TextEncoder().encode(f.content);
      await uploadWithProgress(device, path, bytes, `Uploading ${f.name}…`, { fileIndex: i, fileCount: todo.length, startedAt });
      useApp.getState().recordUpload(projectId, deviceName, { [f.name]: hashContent(f.content) });
      useApp.getState().appendConsole("info", `[upload → ${path} (${bytes.length}B)]\n`);
    }
    return { uploaded: todo.length, unchanged: pool.length - todo.length };
  } finally {
    syncing = false;
    useApp.getState().setTransfer(null);
  }
}

/** Report a transfer error consistently (console + popup); cancellation is quiet. */
async function report(action: string, e: unknown): Promise<void> {
  const { appendConsole } = useApp.getState();
  if (e instanceof CancelledError) {
    // The protocol layer already sent ABORT for the cancelled stream.
    appendConsole("info", `[${action} cancelled]\n`);
    return;
  }
  const msg = (e as Error).message;
  appendConsole("err", `[${action} failed: ${msg}]\n`);
  await showAlert(`${action[0].toUpperCase()}${action.slice(1)} failed`, msg);
}

/** Header "Upload" / project "Upload all". */
export async function uploadProject(projectId: string, mode: "changed" | "all"): Promise<boolean> {
  try {
    const r = await syncProject(projectId, { mode });
    useApp.getState().appendConsole("info", r.uploaded === 0
      ? "[upload: everything already up to date]\n"
      : `[upload OK: ${r.uploaded} file${r.uploaded === 1 ? "" : "s"}${r.unchanged ? `, ${r.unchanged} unchanged` : ""}]\n`);
    return true;
  } catch (e) {
    await report("upload", e);
    return false;
  }
}

export async function uploadFile(fileId: string): Promise<boolean> {
  const id = useApp.getState().mfp.id;
  try {
    await syncProject(id, { mode: "all", onlyFileIds: [fileId] });
    return true;
  } catch (e) {
    await report("upload", e);
    return false;
  }
}

async function startProgram(path: string): Promise<void> {
  const { device, appendConsole, setRunning } = useApp.getState();
  if (!device) throw new Error("No hub connected.");
  appendConsole("info", `[run → ${path}]\n`);
  // Mark running before RUN: a short program's PROG_END can arrive before the
  // RUN reply resolves, and must not be overwritten afterwards.
  setRunning(true);
  try {
    await device.runFile(path);
  } catch (e) {
    setRunning(false);
    throw e;
  }
}

/** Run the active project's main.py (uploading changed files first). */
export async function runProject(): Promise<void> {
  const s = useApp.getState();
  const p = s.mfp;
  const main = p.files.find((f) => f.name === "main.py");
  if (!main) {
    await showAlert(
      "No main.py",
      `Project "${p.title}" has no main.py at its top level. Create one, or right-click Run → "Run active file".`,
    );
    return;
  }
  try {
    await syncProject(p.id, { mode: "changed" });
    await startProgram(devicePathFor(p.title, main.name));
  } catch (e) {
    await report("run", e);
  }
}

/** Run a specific project file (default: the active one). */
export async function runProjectFile(fileId?: string): Promise<void> {
  const s = useApp.getState();
  const id = fileId ?? s.activeFileId;
  const file = s.mfp.files.find((f) => f.id === id);
  if (!file) {
    await showAlert("No file open", "Open a file to run it.");
    return;
  }
  try {
    await syncProject(s.mfp.id, { mode: "changed" });
    await startProgram(devicePathFor(s.mfp.title, file.name));
  } catch (e) {
    await report("run", e);
  }
}

/** Run a file that already exists on the hub. */
export async function runDevicePath(path: string): Promise<void> {
  try {
    await startProgram(path);
  } catch (e) {
    await report("run", e);
  }
}
