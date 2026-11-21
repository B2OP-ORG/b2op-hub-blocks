// Current project's remote names, shared with code that must not import the
// app store (block fields / generators also run headless in tests). The app
// keeps it in sync with the active project's `.remote` files (see
// syncRemoteRegistry in ./sync.ts).

import type { RemoteSymbol } from "./layout";

let symbols: RemoteSymbol[] = [];
let key = "";
const listeners = new Set<() => void>();

export function remoteSymbols(): readonly RemoteSymbol[] {
  return symbols;
}

export function controlSymbols(): RemoteSymbol[] {
  return symbols.filter((s) => s.role === "control");
}

export function indicatorSymbols(): RemoteSymbol[] {
  return symbols.filter((s) => s.role === "indicator");
}

/** Symbol called `name` with role `role` ("any": control or indicator — they share names). */
export function findSymbol(role: RemoteSymbol["role"] | "any", name: string): RemoteSymbol | undefined {
  return symbols.find((s) => (role === "any" || s.role === role) && s.name === name);
}

/** Replace the symbol list; listeners run only when it actually changed. */
export function setRemoteSymbols(next: RemoteSymbol[]): void {
  const k = JSON.stringify(next);
  if (k === key) return;
  key = k;
  symbols = next;
  for (const l of listeners) l();
}

export function onRemoteSymbolsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * "Create remote name…" in the block toolbox. Set by the UI (it needs dialogs
 * and the store); resolves to the created symbol or null.
 */
let createHandler: (() => Promise<RemoteSymbol | null>) | null = null;

export function setCreateRemoteNameHandler(h: typeof createHandler): void {
  createHandler = h;
}

export function createRemoteName(): Promise<RemoteSymbol | null> {
  return createHandler ? createHandler() : Promise.resolve(null);
}
