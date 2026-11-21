// Vite plugin: prepares the two assets the in-browser language server needs,
// as files under node_modules/.cache/b2op-pyright/ that the app imports with `?url`:
//
//  - pyright.worker.js   browser-basedpyright's worker, patched to use less memory
//                        (see patchPyrightWorker).
//  - pyright-files.json  the LSP stubs (src/lsp/stubs/files) routed to their
//                        /workspace paths + pyrightconfig.json — the server's
//                        virtual file system, fetched once when the server starts
//                        so the main thread never keeps the stub text.
//
// Both are regenerated at startup; the stubs JSON also when a stub changes in dev.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const PATCH_VERSION = "1";

/** Virtual modules whose default export is the URL of each generated file. */
const WORKER_URL_ID = "virtual:pyright-worker-url";
const FILES_URL_ID = "virtual:pyright-files-url";

// ── Worker patches ───────────────────────────────────────────────────────────

/**
 * Index just past the object literal starting at `start` (which must be `{`).
 * The literal only holds string keys/values, so only strings need skipping.
 */
function objectLiteralEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; src[i] !== c; i++) {
        if (i >= src.length) throw new Error("unterminated string");
        if (src[i] === "\\") i++;
        else if (c === "`" && src[i] === "$" && src[i + 1] === "{") throw new Error("template expression in typeshed map");
      }
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  throw new Error("unterminated object literal");
}

function fail(patch: string, detail: string): never {
  throw new Error(
    `[pyright-worker] patch "${patch}" no longer applies (${detail}). ` +
      "browser-basedpyright probably changed: update scripts/vite-pyright.ts.",
  );
}

/** Replace the single match of `re` in `src`, failing loudly unless there is exactly one. */
function replaceOnce(src: string, patch: string, re: RegExp, replacement: string): string {
  const n = [...src.matchAll(new RegExp(re.source, "g"))].length;
  if (n !== 1) fail(patch, `${n} matches`);
  return src.replace(re, replacement);
}

/**
 * Patch browser-basedpyright's worker bundle:
 *  1. Drop the bundled typeshed (~14 MB, ~5400 files). The server merges it
 *     into its file system, but our pyrightconfig points `typeshedPath` at the
 *     stubs we ship, so none of it is ever read.
 *  2. No background analysis worker: it would hold a second copy of the whole
 *     program. The server analyzes in the foreground in 50 ms slices instead.
 *  3. Don't keep the initial files around (only the background worker used them).
 */
export function patchPyrightWorker(src: string): string {
  // 1. Bundled typeshed: a module `<id>(e){e.exports={"/typeshed-fallback/…": "…", …}}`.
  const typeshed = [...src.matchAll(/(\d+)\(e\)\{e\.exports=(?=\{"\/typeshed-fallback\/)/g)];
  if (typeshed.length !== 1) fail("drop typeshed", `${typeshed.length} typeshed modules`);
  const [m] = typeshed;
  const id = m[1];
  const uses = [...src.matchAll(new RegExp(`\\b\\w\\(${id}\\)`, "g"))].length;
  if (uses !== 1) fail("drop typeshed", `module ${id} required ${uses} times`);
  const objStart = m.index + m[0].length;
  const objEnd = objectLiteralEnd(src, objStart);
  let out = src.slice(0, objStart) + "{}" + src.slice(objEnd);

  // 2. createBackgroundAnalysis(e,n){let t=new N(n,this.serviceProvider);return this._initialFiles&&t.initializeFileSystem(this._initialFiles),t}
  out = replaceOnce(
    out,
    "no background analysis",
    /createBackgroundAnalysis\((\w+),(\w+)\)\{let (\w+)=new [\w$]+\(\2,this\.serviceProvider\);return this\._initialFiles&&\3\.initializeFileSystem\(this\._initialFiles\),\3\}/,
    "createBackgroundAnalysis(){}",
  );

  // 3. initialize(){… this._initialFiles=e,this.serverOptions.serviceProvider.fs().apply(e) …}
  out = replaceOnce(out, "drop initial files", /this\._initialFiles=(\w+),(?=this\.serverOptions\.serviceProvider\.fs\(\)\.apply\(\1\))/, "");

  // Source map no longer matches.
  return out.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n");
}

// ── Language-server file system ──────────────────────────────────────────────

function walk(dir: string, rel = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".") || e.name === "__pycache__") return [];
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? walk(path.join(dir, e.name), r) : e.isFile() ? [r] : [];
  });
}

/**
 * The server's virtual file system: stub files (paths relative to the stubs
 * dir, POSIX) routed to their /workspace location, plus pyrightconfig.json.
 *
 *   typings/stdlib/** → /workspace/typings/stdlib/**  (typeshedPath: proper typeshed treatment,
 *   typings/stubs/**  → /workspace/typings/stubs/**    @overload-only stubs work without impl)
 *   typings/**        → /workspace/stubs/**            (root-level MicroPython pkg stubs: time, etc.)
 *   **                → /workspace/stubs/**            (custom firmware stubs: hub, machine, etc.)
 *
 * Custom firmware stubs are applied last so they win over typings copies.
 */
export function routeStubFiles(stubs: Record<string, string>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(stubs)) {
    if (k.startsWith("typings/stdlib/") || k.startsWith("typings/stubs/")) {
      files[`/workspace/typings/${k.slice("typings/".length)}`] = v;
    } else if (k.startsWith("typings/")) {
      files[`/workspace/stubs/${k.slice("typings/".length)}`] = v;
    }
  }
  for (const [k, v] of Object.entries(stubs)) {
    if (!k.startsWith("typings/")) files[`/workspace/stubs/${k}`] = v;
  }
  files["/workspace/pyrightconfig.json"] = JSON.stringify({
    typeCheckingMode: "basic",
    typeshedPath: "/workspace/typings",
    stubPath: "stubs",
    // Stub .py files are imported, not project code: don't track them as source files.
    exclude: ["typings", "stubs"],
    pythonVersion: "3",
    reportMissingModuleSource: "none",
  });
  return files;
}

function readStubs(dir: string): Record<string, string> {
  return Object.fromEntries(walk(dir).sort().map((rel) => [rel, readFileSync(path.join(dir, rel), "utf8")]));
}

// ── Plugin ───────────────────────────────────────────────────────────────────

function writeIfChanged(file: string, content: string): void {
  if (existsSync(file) && readFileSync(file, "utf8") === content) return;
  writeFileSync(file, content);
}

export function pyrightAssets(root: string): Plugin {
  const cacheDir = path.join(root, "node_modules/.cache/b2op-pyright");
  const stubsDir = path.join(root, "src/lsp/stubs/files");
  const workerSrc = path.join(root, "node_modules/browser-basedpyright/dist/pyright.worker.js");
  const workerOut = path.join(cacheDir, "pyright.worker.js");
  const filesOut = path.join(cacheDir, "pyright-files.json");

  function buildWorker(): void {
    const src = readFileSync(workerSrc, "utf8");
    const stamp = createHash("sha256").update(PATCH_VERSION).update(src).digest("hex");
    const stampFile = `${workerOut}.stamp`;
    if (existsSync(workerOut) && existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp) return;
    writeFileSync(workerOut, patchPyrightWorker(src));
    writeFileSync(stampFile, stamp);
  }

  const buildFiles = () => writeIfChanged(filesOut, JSON.stringify(routeStubFiles(readStubs(stubsDir))));

  // Not imported through an alias + `?url`: the dev dep optimizer would treat a
  // file under node_modules as a package and pre-bundle it.
  const sources: Record<string, { file: string; name: string }> = {
    [WORKER_URL_ID]: { file: workerOut, name: "pyright.worker.js" },
    [FILES_URL_ID]: { file: filesOut, name: "pyright-files.json" },
  };
  let serve = false;
  // Dev: served raw by the middleware below. Through /@fs Vite would run the
  // worker through its JS transform and inline a multi-MB source map.
  const DEV_PREFIX = "/@b2op-pyright/";

  return {
    name: "b2op-pyright-assets",
    config(_config, env) {
      serve = env.command === "serve";
      mkdirSync(cacheDir, { recursive: true });
      buildWorker();
      buildFiles();
    },
    resolveId(id) {
      return id in sources ? `\0${id}` : undefined;
    },
    load(id) {
      const src = id.startsWith("\0") ? sources[id.slice(1)] : undefined;
      if (!src) return;
      if (serve) return `export default ${JSON.stringify(DEV_PREFIX + src.name)};`;
      const ref = this.emitFile({ type: "asset", name: src.name, source: readFileSync(src.file) });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.startsWith(DEV_PREFIX) ? req.url.slice(DEV_PREFIX.length).split("?")[0] : "";
        const src = Object.values(sources).find((s) => s.name === name);
        if (!src) return next();
        res.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "text/javascript");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(src.file));
      });
      server.watcher.add(stubsDir);
      const onChange = (f: string) => {
        if (!f.startsWith(stubsDir)) return;
        buildFiles();
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onChange);
      server.watcher.on("change", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}
