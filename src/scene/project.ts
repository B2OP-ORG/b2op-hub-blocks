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
