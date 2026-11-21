// The project's Python files as the language server sees them: each at
// `file:///workspace/<path>` (the workspace root is pyright's execution root),
// so `import menu` in main.py finds menu.py — scenes included.

import { useApp } from "../../state/store";
import type { LspService } from "./lspClient";

/** Language-server URI of a project file (project-relative path). */
export function projectFileUri(path: string): string {
  return `file:///workspace/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const isPython = (name: string) => /\.pyi?$/i.test(name);

/** Mirror the active project's Python files to `svc` now and on every change. */
export function attachProjectFiles(svc: LspService): () => void {
  let last: unknown = null;
  const push = () => {
    const files = useApp.getState().mfp.files;
    if (files === last) return;
    last = files;
    svc.setProjectFiles(new Map(files.filter((f) => isPython(f.name)).map((f) => [projectFileUri(f.name), f.content])));
  };
  push();
  return useApp.subscribe(push);
}
