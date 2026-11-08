// Singleton LSP service — one pyright worker lives for the whole session.
// Multiple MonacoViews share the same service by calling openDocument/closeDocument.

import { useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import { useApp } from "../../state/store";
import { createWorkerTransport, createWsTransport } from "./transport";
import { startLspService, type LspService } from "./lspClient";

// Module-level singleton so the pyright worker isn't re-spawned on remounts.
let _singleton: { key: string; service: LspService } | null = null;

export function useLspService(monacoNs: typeof monaco | null): LspService | null {
  const mode = useApp((s) => s.editorSettings.lspMode);
  const remoteUrl = useApp((s) => s.editorSettings.lspRemoteUrl);
  const appendConsole = useApp((s) => s.appendConsole);
  const [service, setService] = useState<LspService | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!monacoNs || mode === "off") {
      setService(null);
      return;
    }

    const key = `${mode}::${remoteUrl}`;

    if (_singleton?.key === key) {
      setService(_singleton.service);
      return;
    }

    // Tear down old singleton before creating a new one.
    _singleton?.service.dispose();
    _singleton = null;
    setService(null);

    cancelledRef.current = false;

    (async () => {
      let transport;
      try {
        transport =
          mode === "worker"
            ? createWorkerTransport()
            : await createWsTransport(remoteUrl);
      } catch (e) {
        appendConsole("err", `LSP transport failed: ${(e as Error).message}`);
        return;
      }
      if (cancelledRef.current) {
        transport.dispose();
        return;
      }
      const svc = startLspService(monacoNs, transport);
      _singleton = { key, service: svc };
      setService(svc);
    })();

    return () => {
      cancelledRef.current = true;
      // Don't dispose the singleton — it persists across remounts.
    };
  }, [monacoNs, mode, remoteUrl, appendConsole]);

  return service;
}
