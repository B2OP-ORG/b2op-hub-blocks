// Vite bundles every stub file under `./files/**` as a raw string at build time.
// Keys are POSIX paths relative to files/ (e.g. "hub.pyi", "typings/stdlib/builtins.pyi").
// transport.ts routes them: typings/* → /workspace/typings/, rest → /workspace/stubs/.
const raw = import.meta.glob("./files/**/*", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

export const STUBS: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k.replace(/^\.\/files\//, ""), v])
);

export const STUB_ROOT = "/stubs";
