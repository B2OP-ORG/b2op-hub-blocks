import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { AssetRef, FileMode, ImageSource, MultiFileProject, ProjectFile, ProjectSettings } from "./format";
import { DEFAULT_SETTINGS, binaryTypeOf, newMultiFileProject } from "./format";
import { normalizeRelPath } from "./paths";

export const MANIFEST_NAME = "b2op-project.json";
/** Folder of the full images that image files were cropped / scaled from (not project files). */
export const ORIGINALS_DIR = ".b2op-originals";

interface Manifest {
  format: "b2op-project-zip";
  version: 1;
  title: string;
  settings: ProjectSettings;
  /** path → explicit editor mode (only when set). */
  modes: Record<string, FileMode>;
  folders: string[];
  /** path → the original an image file was made from (bytes in ORIGINALS_DIR/<hash>). */
  sources?: Record<string, ImageSource>;
}

// Copy into this realm's Uint8Array: fflate tells files from folders via `instanceof`.
const u8 = (s: string) => new Uint8Array(strToU8(s));

/**
 * Zip of the project. `assets`: bytes of its binary files by hash (see
 * loadProjectAssets); a binary file whose bytes are missing is left out.
 */
export function projectToZip(p: MultiFileProject, assets: ReadonlyMap<string, Uint8Array> = new Map()): Uint8Array {
  const entries: Zippable = {};
  const modes: Record<string, FileMode> = {};
  const sources: Record<string, ImageSource> = {};
  for (const f of p.files) {
    if (f.asset) {
      const bytes = assets.get(f.asset.hash);
      if (bytes) entries[f.name] = new Uint8Array(bytes);
      const src = f.asset.source, orig = src && assets.get(src.hash);
      if (bytes && src && orig) {
        sources[f.name] = src;
        entries[`${ORIGINALS_DIR}/${src.hash}`] = new Uint8Array(orig);
      }
      continue;
    }
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
    ...(Object.keys(sources).length ? { sources } : {}),
  };
  entries[MANIFEST_NAME] = u8(JSON.stringify(manifest, null, 2));
  return zipSync(entries, { level: 6 });
}

export interface ZipImport {
  project: MultiFileProject;
  /** Paths skipped because they aren't UTF-8 text (nor a known binary type). */
  skipped: string[];
  /** Bytes of the project's binary files by hash: put them in the asset store before using the project. */
  assets: Map<string, Uint8Array>;
}

/** Asset reference for binary bytes (hash via `hash`, e.g. sha256Hex). */
export async function assetRefFor(bytes: Uint8Array, type: string, hash: (b: Uint8Array) => Promise<string>): Promise<AssetRef> {
  return { hash: await hash(bytes), type, size: bytes.length };
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Build a project from any zip. A single shared top-level folder is stripped. */
export async function zipToProject(data: Uint8Array, fallbackTitle: string, hash: (b: Uint8Array) => Promise<string>): Promise<ZipImport> {
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
  const assets = new Map<string, Uint8Array>();
  for (const name of names) {
    if (name === MANIFEST_NAME) continue;
    if (name.startsWith(ORIGINALS_DIR + "/")) {
      const id = name.slice(ORIGINALS_DIR.length + 1);
      if (/^[0-9a-f]{64}$/.test(id) && (await hash(raw[prefix + name])) === id) assets.set(id, raw[prefix + name]);
      continue;
    }
    if (name.endsWith("/")) {
      const d = normalizeRelPath(name);
      if (d) folders.add(d);
      continue;
    }
    const path = normalizeRelPath(name);
    if (!path) continue;
    const bytes = raw[prefix + name];
    const type = binaryTypeOf(path);
    if (type) {
      const asset = await assetRefFor(bytes, type, hash);
      const source = manifest?.sources?.[path];
      if (source) asset.source = source;
      assets.set(asset.hash, bytes);
      files.push({ id: crypto.randomUUID(), name: path, content: "", asset });
      continue;
    }
    const text = decodeText(bytes);
    if (text === null) { skipped.push(path); continue; }
    files.push({ id: crypto.randomUUID(), name: path, content: text, mode: manifest?.modes?.[path] });
  }

  for (const f of files) if (f.asset?.source && !assets.has(f.asset.source.hash)) delete f.asset.source;

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
  return { project, skipped, assets };
}
