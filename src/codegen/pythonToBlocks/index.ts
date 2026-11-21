import { stripBlocksHeader } from "../../project/format";
import { classifyDeviceGroup } from "./deviceGroups";
import { chain } from "./helpers";
import { type Group, type Line, groupAt, parseLines } from "./lines";
import { type Ctx, refsInGroup, scanRemoteDecls, translateGroups } from "./translate";
import type { ButtonHat, Translation } from "./types";

/**
 * Best-effort Python → Blockly translator used when switching a Python project
 * back to Blocks mode. Handles:
 *
 * - Hub-level statements (LED, buttons, IMU, LCD, log).
 * - Motor + sensor blocks via typed-device setup groups.
 * - Control flow: `if/elif/else`, `while`, `for X in range(...)`.
 * - `print(...)`, simple `NAME = expr` assignments.
 * - Expressions: numbers, strings, booleans, variables, `+ - * / % **`,
 *   comparisons (`== != < > <= >=`), `and/or/not`, list literals `[a,b,c]`,
 *   `len(x)`, unary minus, parenthesized groups.
 * - Remote controller: `remote.<name>` / `remote.get("name")` reads and
 *   `remote.send(id, v)` (id → name from the `remote.create_message` lines).
 *
 * Anything unsupported becomes a `raw_python` block so the code still runs.
 */

export { hasRawBlock, normalizePython } from "./helpers";
export type { BlockSpec, ButtonHat, Translation } from "./types";

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const VERSION_RE = /^#\s*b2op-hub-blocks\s+v2\.\d+\.\d+\s*$/;

export function pythonToBlocks(source: string): Translation {
  // The blocks header line is storage metadata, not program code.
  source = stripBlocksHeader(source);
  const lines = parseLines(source);

  // Reject Python not tagged as b2op-hub-blocks v2.x — return as opaque raw block.
  const firstText = lines.find((l) => l.text !== "")?.text ?? "";
  if (!VERSION_RE.test(firstText)) {
    const trimmed = source.trim();
    const main = trimmed ? { type: "raw_python" as const, data: trimmed } : undefined;
    return { main, buttonHats: [], variables: [] };
  }

  const ctx: Ctx = {
    portKind: new Map(),
    keepRaw: new Set(),
    vars: new Set(),
    remoteMsgs: scanRemoteDecls(lines),
  };

  const { groups } = groupAt(lines, 0, lines.length, 0);

  const mainGroups: Group[] = [];
  const buttonHatGroups: { btn: string; body: Line[] }[] = [];
  const BTN_DECO = /^@hub\.buttons\.on\(\s*["'](center|up|down|left|right)["']\s*\)$/;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const t = g.header.text;
    const dm = BTN_DECO.exec(t);
    if (dm) {
      const next = groups[i + 1];
      if (next && /^def\s+\w+\(\s*\)\s*:$/.test(next.header.text)) {
        buttonHatGroups.push({ btn: dm[1], body: next.bodyLines });
        i++;
        continue;
      }
    }
    mainGroups.push(g);
  }

  const btnHatBodyGroups: Group[][] = buttonHatGroups.map((h) => bodyToGroups(h.body));
  const walkable = [...mainGroups, ...btnHatBodyGroups.flat()];
  const walkGroups = (gs: Group[], visit: (g: Group) => void) => {
    for (const g of gs) {
      visit(g);
      const inner = parseLines(g.bodyLines.map((l) => l.raw).join("\n"));
      const base = inner.find((l) => l.text !== "")?.indent ?? 0;
      const { groups: sub } = groupAt(inner, 0, inner.length, base);
      if (sub.length) walkGroups(sub, visit);
    }
  };
  walkGroups(walkable, (g) => {
    const cd = classifyDeviceGroup(g, ctx.portKind);
    if (cd.role === "setup2" && cd.port && cd.kind) ctx.portKind.set(cd.port, cd.kind);
  });
  walkGroups(walkable, (g) => {
    const refs = refsInGroup(g);
    if (refs.size === 0) return;
    const cd = classifyDeviceGroup(g, ctx.portKind);
    if (cd.role === "opaque") for (const p of refs) ctx.keepRaw.add(p);
  });

  const mainSpecs = translateGroups(mainGroups, ctx);
  const buttonHats: ButtonHat[] = buttonHatGroups.map((h, i) => ({
    btn: h.btn,
    chain: chain(translateGroups(btnHatBodyGroups[i], ctx)),
  }));

  const variables = [...ctx.vars].map((name) => ({ name, id: name }));
  return { main: chain(mainSpecs), buttonHats, variables };
}

function bodyToGroups(bodyLines: Line[]): Group[] {
  if (bodyLines.length === 0) return [];
  const first = bodyLines.find((l) => l.text !== "" && !l.text.startsWith("#"));
  if (!first) return [];
  const baseIndent = first.indent;
  return groupAt(bodyLines, 0, bodyLines.length, baseIndent).groups;
}
