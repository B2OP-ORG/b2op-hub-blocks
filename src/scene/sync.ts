// Keeps the scene registry (block fields, generators) in step with the active
// project. The language server sees scene modules as ordinary project files
// (lsp/projectFiles.ts).

import { useApp } from "../state/store";
import { projectScenes } from "./project";
import { setScenes } from "./registry";

let started = false;

/** Start following the store. Idempotent. */
export function startSceneSync(): void {
  if (started) return;
  started = true;
  let lastFiles: unknown = null;
  const update = () => {
    const files = useApp.getState().mfp.files;
    if (files === lastFiles) return;
    lastFiles = files;
    setScenes(projectScenes(files));
  };
  update();
  useApp.subscribe(update);
}
