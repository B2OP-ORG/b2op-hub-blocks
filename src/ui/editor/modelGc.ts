// Disposes Monaco text models nobody needs any more.
//
// @monaco-editor/react creates one model per `path` and keeps it when the
// editor switches to another path (it only disposes the model shown at
// unmount), so every file, example and project visited would stay in memory.
// Kept: models shown in an editor, and those of the active project's open
// tabs (their undo history survives tab switches).

import type * as monaco from "monaco-editor";
import { useApp } from "../../state/store";
import { projectFileUri } from "../../lsp/projectFiles";

const WORKSPACE = "file:///workspace/";

function collect(m: typeof monaco): void {
  const s = useApp.getState();
  const keep = new Set<string>();
  for (const id of s.openFileIds) {
    const f = s.mfp.files.find((x) => x.id === id);
    if (f) keep.add(projectFileUri(f.name));
  }
  const shown = new Set(m.editor.getEditors().map((e) => e.getModel()));
  for (const model of m.editor.getModels()) {
    const uri = model.uri.toString();
    if (!uri.startsWith(WORKSPACE) || keep.has(uri) || shown.has(model)) continue;
    model.dispose();
  }
}

let installed = false;

/** Start collecting on tab / project / file changes. Idempotent. */
export function installModelGc(m: typeof monaco): void {
  if (installed) return;
  installed = true;
  let lastOpen: unknown = null;
  let lastFiles: unknown = null;
  let lastExtra: unknown = null;
  let scheduled = false;
  useApp.subscribe((s) => {
    if (s.openFileIds === lastOpen && s.mfp.files === lastFiles && s.extraTabs === lastExtra) return;
    lastOpen = s.openFileIds;
    lastFiles = s.mfp.files;
    lastExtra = s.extraTabs;
    if (scheduled) return;
    scheduled = true;
    // After React has re-rendered, so editors already show their new model.
    setTimeout(() => {
      scheduled = false;
      collect(m);
    }, 1000);
  });
}
