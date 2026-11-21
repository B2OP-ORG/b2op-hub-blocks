import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { patchPyrightWorker, routeStubFiles } from "../scripts/vite-pyright";

const WORKER = path.resolve(__dirname, "../node_modules/browser-basedpyright/dist/pyright.worker.js");

describe("patchPyrightWorker", () => {
  const src = readFileSync(WORKER, "utf8");
  const out = patchPyrightWorker(src);

  it("drops the bundled typeshed", () => {
    expect(src).toContain('"/typeshed-fallback/');
    expect(out).not.toContain('"/typeshed-fallback/');
    expect(out.length).toBeLessThan(src.length / 3);
  });

  it("disables background analysis and stops retaining the initial files", () => {
    expect(out).toContain("createBackgroundAnalysis(){}");
    expect(out).not.toContain("_initialFiles");
  });

  it("still parses", () => {
    expect(() => new Function(out)).not.toThrow();
  });

  it("fails loudly when a pattern no longer matches", () => {
    expect(() => patchPyrightWorker(src.replace("createBackgroundAnalysis(e,n){", "createBackgroundAnalysis(e,n,x){"))).toThrow(
      /no background analysis/,
    );
  });
});

describe("routeStubFiles", () => {
  it("routes stubs to their /workspace paths and adds the config", () => {
    const files = routeStubFiles({
      "typings/stdlib/builtins.pyi": "a",
      "typings/time.pyi": "b",
      "hub/__init__.pyi": "c",
      "machine.pyi": "custom",
      "typings/machine.pyi": "typings copy",
    });
    expect(files["/workspace/typings/stdlib/builtins.pyi"]).toBe("a");
    expect(files["/workspace/stubs/time.pyi"]).toBe("b");
    expect(files["/workspace/stubs/hub/__init__.pyi"]).toBe("c");
    expect(files["/workspace/stubs/machine.pyi"]).toBe("custom");
    expect(JSON.parse(files["/workspace/pyrightconfig.json"]).typeshedPath).toBe("/workspace/typings");
  });
});
