// The project's Python files as the language server sees them: each at
// `file:///workspace/<path>` (the workspace root is pyright's execution root),
// so `import menu` in main.py finds menu.py — scenes included.
// The example being viewed is mirrored too, under `__examples__/`, so a folder
// example's `import ticker` finds its sibling (and the stubs config applies).

import { useApp } from "../../state/store";
import type { LspService } from "./lspClient";

/** Language-server URI of a project file (project-relative path). */
export function projectFileUri(path: string): string {
  return `file:///workspace/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const isPython = (name: string) => /\.pyi?$/i.test(name);

/** Language-server URI of an example file (path relative to public/examples/). */
export function exampleFileUri(path: string): string {
  return projectFileUri(`__examples__/${path}`);
}

// Files of the example being viewed (uri → text), and the attached service.
let exampleFiles: ReadonlyMap<string, string> = new Map();
let attached: LspService | null = null;

/** Mirror an example's files (path relative to public/examples/ → text); empty map clears. */
export function setExampleFiles(files: ReadonlyMap<string, string>): void {
  exampleFiles = new Map([...files].filter(([path]) => isPython(path)).map(([path, text]) => [exampleFileUri(path), text]));
  attached?.setFileGroup("examples", exampleFiles);
}

/** Mirror the active project's Python files (and the viewed example) to `svc` now and on every change. */
export function attachProjectFiles(svc: LspService): () => void {
  attached = svc;
  svc.setFileGroup("examples", exampleFiles);
  let last: unknown = null;
  const push = () => {
    const files = useApp.getState().mfp.files;
    if (files === last) return;
    last = files;
    svc.setProjectFiles(new Map(files.filter((f) => isPython(f.name)).map((f) => [projectFileUri(f.name), f.content])));
  };
  push();
  const unsubscribe = useApp.subscribe(push);
  return () => {
    unsubscribe();
    if (attached === svc) attached = null;
  };
}
