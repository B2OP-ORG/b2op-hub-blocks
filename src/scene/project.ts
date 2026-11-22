// Scene files in a project: detection and the registry view of them.
// Store-free so blocks / tests can use it.

import { moduleOfPath, splitSceneHeader, isSceneContent } from "./model";
import type { SceneInfo } from "./registry";

export interface FileLike {
  id: string;
  name: string;
  content: string;
}

/** A project file edited in the scene editor: `.py` with a `# __scene__:` header. */
export function isSceneFile(f: { name: string; content: string }): boolean {
  return /\.py$/i.test(f.name) && isSceneContent(f.content);
}

/** Every scene of the project (files whose header is broken are skipped). */
export function projectScenes(files: FileLike[]): SceneInfo[] {
  const out: SceneInfo[] = [];
  for (const f of files) {
    if (!isSceneFile(f)) continue;
    const { doc } = splitSceneHeader(f.content);
    if (!doc) continue;
    out.push({
      module: moduleOfPath(f.name),
      fileId: f.id,
      path: f.name,
      widgets: doc.widgets.map((w) => ({ name: w.name, kind: w.kind })),
    });
  }
  return out.sort((a, b) => a.module.localeCompare(b.module));
}

/** Directory of a scene file ("" at the top level). */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Project path an image widget's `src` points at (relative to the scene file,
 * like the generated code's `_DIR + "/" + src`); null for absolute device
 * paths ("/sd/…") and paths leaving the project.
 */
export function resolveSceneSrc(scenePath: string, src: string): string | null {
  if (!src || src.startsWith("/")) return null;
  const segs = dirOf(scenePath) ? dirOf(scenePath).split("/") : [];
  for (const s of src.replace(/\\/g, "/").split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") { if (!segs.length) return null; segs.pop(); continue; }
    segs.push(s);
  }
  return segs.length ? segs.join("/") : null;
}

/** `src` for project file `path` as seen from scene file `scenePath` ("images/a.png", "../logo.png"). */
export function sceneSrcFor(scenePath: string, path: string): string {
  const from = dirOf(scenePath) ? dirOf(scenePath).split("/") : [];
  const to = path.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/");
}
