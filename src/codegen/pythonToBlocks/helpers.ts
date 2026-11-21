import type { BlockSpec } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hasRawBlock(chainSpec: BlockSpec | undefined): boolean {
  const visit = (b: BlockSpec | undefined): boolean => {
    if (!b) return false;
    if (b.type === "raw_python") return true;
    if (b.inputs) {
      for (const key of Object.keys(b.inputs)) {
        const sub = b.inputs[key].block;
        if (sub && visit(sub)) return true;
      }
    }
    if (b.next?.block && visit(b.next.block)) return true;
    return false;
  };
  return visit(chainSpec);
}

export function normalizePython(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chain(specs: BlockSpec[]): BlockSpec | undefined {
  if (specs.length === 0) return undefined;
  for (let i = specs.length - 1; i > 0; i--) {
    specs[i - 1].next = { block: specs[i] };
  }
  return specs[0];
}
