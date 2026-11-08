import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { FileMode, MultiFileProject, ProjectFile, ProjectSettings } from "./format";
import { DEFAULT_SETTINGS, newMultiFileProject } from "./format";
import { normalizeRelPath } from "./paths";

export const MANIFEST_NAME = "b2op-project.json";

interface Manifest {
  format: "b2op-project-zip";
  version: 1;
  title: string;
  settings: ProjectSettings;
  /** path → explicit editor mode (only when set). */
  modes: Record<string, FileMode>;
  folders: string[];
}

// Copy into this realm's Uint8Array: fflate tells files from folders via `instanceof`.
const u8 = (s: string) => new Uint8Array(strToU8(s));

export function projectToZip(p: MultiFileProject): Uint8Array {
  const entries: Zippable = {};
  const modes: Record<string, FileMode> = {};
  for (const f of p.files) {
    entries[f.name] = u8(f.content);
    if (f.mode) modes[f.name] = f.mode;
  }
  for (const d of p.folders) {
    if (!p.files.some((f) => f.name.startsWith(d + "/"))) entries[d + "/"] = new Uint8Array(0);
  }
  const manifest: Manifest = {
    format: "b2op-project-zip",
    version: 1,
    title: p.title,
    settings: p.settings,
    modes,
    folders: p.folders,
  };
  entries[MANIFEST_NAME] = u8(JSON.stringify(manifest, null, 2));
  return zipSync(entries, { level: 6 });
}

export interface ZipImport {
  project: MultiFileProject;
  /** Paths skipped because they aren't UTF-8 text. */
  skipped: string[];
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Build a project from any zip. A single shared top-level folder is stripped. */
export function zipToProject(data: Uint8Array, fallbackTitle: string): ZipImport {
  const raw = unzipSync(data);
  let names = Object.keys(raw).filter((n) => !n.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(n));

  // Strip a common top-level folder ("proj/main.py", "proj/lib/x.py" → "main.py", "lib/x.py").
  let prefix = "";
  const tops = new Set(names.map((n) => n.split("/")[0]));
  if (tops.size === 1 && names.every((n) => n.includes("/"))) {
    prefix = [...tops][0] + "/";
    if (!fallbackTitle || fallbackTitle === "Imported") fallbackTitle = [...tops][0];
  }
  names = names.map((n) => n.slice(prefix.length)).filter(Boolean);

  let manifest: Manifest | null = null;
  const manBytes = raw[prefix + MANIFEST_NAME];
  if (manBytes) {
    try {
      const m = JSON.parse(strFromU8(manBytes)) as Manifest;
      if (m.format === "b2op-project-zip") manifest = m;
    } catch { /* ignore broken manifest */ }
  }

  const files: ProjectFile[] = [];
  const folders = new Set<string>(manifest?.folders ?? []);
  const skipped: string[] = [];
  for (const name of names) {
    if (name === MANIFEST_NAME) continue;
    if (name.endsWith("/")) {
      const d = normalizeRelPath(name);
      if (d) folders.add(d);
      continue;
    }
    const path = normalizeRelPath(name);
    if (!path) continue;
    const text = decodeText(raw[prefix + name]);
    if (text === null) { skipped.push(path); continue; }
    files.push({ id: crypto.randomUUID(), name: path, content: text, mode: manifest?.modes?.[path] });
  }

  const base = newMultiFileProject(manifest?.title ?? fallbackTitle);
  const first = files.find((f) => f.name === "main.py") ?? files[0];
  const project: MultiFileProject = {
    ...base,
    settings: { ...DEFAULT_SETTINGS, ...(manifest?.settings ?? {}) },
    files,
    folders: [...folders].sort(),
    openFileIds: first ? [first.id] : [],
    activeFileId: first?.id ?? "",
  };
  return { project, skipped };
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = "application/octet-stream"): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
