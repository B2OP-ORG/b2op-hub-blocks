// The firmware stubs the main thread needs: the API reference (src/docs/apiModel.ts
// reads hub, lpf2 and remote) and the generated remote stub (src/remote/sync.ts).
// Keys are POSIX paths relative to files/ (e.g. "hub/lcd.pyi", "remote.pyi").
//
// The language server gets the full set (typings, lvgl, …) from a JSON asset
// built by scripts/vite-pyright.ts, so those strings never live in this thread.
const raw = import.meta.glob(["./files/hub/**/*.py{,i}", "./files/lpf2/**/*.py{,i}", "./files/remote.pyi"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const STUBS: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k.replace(/^\.\/files\//, ""), v])
);
