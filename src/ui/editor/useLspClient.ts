// Singleton LSP service — one pyright worker lives for the whole session.
// Multiple MonacoViews share the same service by calling openDocument/closeDocument.

import { useEffect, useState } from "react";
import type * as monaco from "monaco-editor";
import { useApp } from "../../state/store";
import type { EditorSettings } from "../../settings/editorSettings";
import { createWorkerTransport, createWsTransport } from "../../lsp/transport";
import { startLspService, type LspService } from "../../lsp/lspClient";
import { attachRemoteStub } from "../../remote/sync";
import { attachProjectFiles } from "../../lsp/projectFiles";

interface Singleton {
  key: string;
  /** Resolves once the service is up; null if the transport failed or it was torn down. */
  ready: Promise<LspService | null>;
  teardown(): void;
}

/** Shut the server down after no editor has used it for this long. */
const IDLE_MS = 120_000;

// Module-level singleton so the pyright worker isn't re-spawned on remounts.
// Every caller waits on the same `ready` promise, so concurrent mounts (two
// editors, StrictMode) never start a second service — each service registers
// its own Monaco providers, and two would show every hover twice.
let _singleton: Singleton | null = null;

// Mounted editors using the service. When the last one goes (no Python editor
// or preview visible), the server is torn down after IDLE_MS to free its
// memory; the next editor starts a fresh one.
let _consumers = 0;
let _idleTimer: ReturnType<typeof setTimeout> | undefined;

function acquire(): void {
  _consumers++;
  clearTimeout(_idleTimer);
  _idleTimer = undefined;
}

function release(): void {
  if (--_consumers > 0) return;
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    _idleTimer = undefined;
    if (_consumers > 0) return;
    _singleton?.teardown();
    _singleton = null;
  }, IDLE_MS);
}

function startSingleton(
  key: string,
  monacoNs: typeof monaco,
  mode: EditorSettings["lspMode"],
  remoteUrl: string,
  onError: (msg: string) => void,
): Singleton {
  let torndown = false;
  let service: LspService | null = null;
  let detach = () => {};

  async function start(): Promise<LspService | null> {
    let transport;
    try {
      transport = mode === "worker" ? createWorkerTransport() : await createWsTransport(remoteUrl);
    } catch (e) {
      onError(`LSP transport failed: ${(e as Error).message}`);
      return null;
    }
    if (torndown) {
      transport.dispose();
      return null;
    }
    service = startLspService(monacoNs, transport);
    const detachRemote = attachRemoteStub(service);
    const detachFiles = attachProjectFiles(service);
    detach = () => { detachRemote(); detachFiles(); };
    return service;
  }

  const singleton: Singleton = {
    key,
    ready: Promise.resolve(null),
    teardown() {
      torndown = true;
      detach();
      service?.dispose();
    },
  };
  singleton.ready = start().then((svc) => {
    // Transport failed: let the next mount retry. (Checked asynchronously so
    // `_singleton` has been assigned even if the transport threw synchronously.)
    if (!svc && !torndown && _singleton === singleton) _singleton = null;
    return svc;
  });
  return singleton;
}

// A hot update re-runs this module with an empty `_singleton`; dispose the old
// service first or its Monaco providers stay registered next to the new ones.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearTimeout(_idleTimer);
    _singleton?.teardown();
    _singleton = null;
  });
}

export function useLspService(monacoNs: typeof monaco | null): LspService | null {
  const mode = useApp((s) => s.editorSettings.lspMode);
  const remoteUrl = useApp((s) => s.editorSettings.lspRemoteUrl);
  const appendConsole = useApp((s) => s.appendConsole);
  const [service, setService] = useState<LspService | null>(null);

  useEffect(() => {
    if (!monacoNs || mode === "off") {
      setService(null);
      return;
    }

    const key = `${mode}::${remoteUrl}`;
    if (_singleton?.key !== key) {
      // Tear down the old singleton before creating a new one.
      _singleton?.teardown();
      _singleton = startSingleton(key, monacoNs, mode, remoteUrl, (msg) => appendConsole("err", msg));
      setService(null);
    }

    acquire();
    let alive = true;
    _singleton.ready.then((svc) => { if (alive) setService(svc); });
    return () => {
      alive = false;
      // Don't dispose the singleton now — it persists across remounts and
      // is only torn down once no editor has used it for IDLE_MS.
      release();
    };
  }, [monacoNs, mode, remoteUrl, appendConsole]);

  return service;
}
