import { useEffect } from "react";
import type * as monaco from "monaco-editor";
import { useApp } from "../../state/store";
import { createWorkerTransport, createWsTransport, type Transport } from "./transport";
import { startLspClient, type LspClient } from "./lspClient";

/**
 * Mounts an LSP client on the given Monaco model according to the current
 * project's LSP settings. Handles reconnection when the mode / URL changes.
 * No-op when mode = "off".
 */
export function useLspClient(
  monacoNs: typeof monaco | null,
  model: monaco.editor.ITextModel | null,
): void {
  const mode = useApp((s) => s.editorSettings.lspMode);
  const remoteUrl = useApp((s) => s.editorSettings.lspRemoteUrl);
  const appendConsole = useApp((s) => s.appendConsole);

  useEffect(() => {
    if (!monacoNs || !model || mode === "off") return;
    let client: LspClient | null = null;
    let cancelled = false;

    (async () => {
      let transport: Transport;
      try {
        transport =
          mode === "worker"
            ? createWorkerTransport()
            : await createWsTransport(remoteUrl);
      } catch (e) {
        appendConsole("err", `LSP transport failed: ${(e as Error).message}`);
        return;
      }
      if (cancelled) {
        transport.dispose();
        return;
      }
      client = startLspClient(monacoNs, model, transport);
    })();

    return () => {
      cancelled = true;
      client?.dispose();
    };
  }, [monacoNs, model, mode, remoteUrl, appendConsole]);
}
