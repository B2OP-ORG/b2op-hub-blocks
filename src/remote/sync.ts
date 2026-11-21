// Keeps derived remote-controller state in step with the active project:
// the symbol registry (block fields, generators) and the language server's
// `remote.pyi` (typed attributes for the project's controls).

import { useApp } from "../state/store";
import { STUBS } from "../lsp/stubs";
import type { LspService } from "../lsp/lspClient";
import { projectSymbols } from "./layout";
import { onRemoteSymbolsChange, remoteSymbols, setRemoteSymbols } from "./registry";
import { remoteStubText } from "./stub";

/** Where transport.ts puts firmware stubs (see its VFS routing). */
export const REMOTE_STUB_URI = "file:///workspace/stubs/remote.pyi";

let started = false;

/** Start following the store. Idempotent. */
export function startRemoteSync(): void {
  if (started) return;
  started = true;
  let lastFiles: unknown = null;
  const update = () => {
    const files = useApp.getState().mfp.files;
    if (files === lastFiles) return;
    lastFiles = files;
    setRemoteSymbols(projectSymbols(files));
  };
  update();
  useApp.subscribe(update);
}

/** Push the generated remote stub to `svc` now and whenever the symbols change. */
export function attachRemoteStub(svc: LspService): () => void {
  const base = STUBS["remote.pyi"];
  if (base === undefined) return () => {};
  const push = () => svc.setVirtualFile(REMOTE_STUB_URI, remoteStubText(base, remoteSymbols()));
  push();
  return onRemoteSymbolsChange(push);
}
