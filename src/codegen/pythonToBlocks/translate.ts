import { classifyDeviceGroup } from "./deviceGroups";
import { parseExpr } from "./expr";
import { chain } from "./helpers";
import { type Group, type Line, groupAt } from "./lines";
import { isNeopixelHelperGroup, isPreambleBoilerplate, matchLedColor, matchNeopixelStatement, matchStatement, tryConsumeNeopixelInit, valueInput } from "./statements";
import type { BlockSpec, DeviceKind } from "./types";

// ---------------------------------------------------------------------------
// Compound-statement translation
// ---------------------------------------------------------------------------

export interface Ctx {
  portKind: Map<string, DeviceKind>;
  keepRaw: Set<string>;
  vars: Set<string>;
  /** Program message id → name, from `remote.create_message(...)` lines. */
  remoteMsgs: Map<number, string>;
}

/** A generated `remote.create_message(id, "name", remote.TYPE)` declaration. */
export const REMOTE_DECL_RE = /^remote\.create_message\(\s*(\d+)\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*remote\.(?:INT|FLOAT|BOOL|STR)\s*\)$/;

function unescapePy(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

export function scanRemoteDecls(lines: Line[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const l of lines) {
    const m = REMOTE_DECL_RE.exec(l.text);
    if (m) out.set(Number(m[1]), unescapePy(m[2] ?? m[3]));
  }
  return out;
}

/** `remote.send(id, value)` → set-indicator block (the int()/str() wrapper is regenerated). */
function matchRemoteSend(line: string, ctx: Ctx): BlockSpec | null {
  const m = /^remote\.send\(\s*(\d+)\s*,\s*(.+)\)$/.exec(line);
  if (!m) return null;
  const name = ctx.remoteMsgs.get(Number(m[1]));
  if (name === undefined) return null;
  let expr = m[2].trim();
  const wrap = /^(?:int|str)\((.*)\)$/.exec(expr);
  if (wrap && parseExpr(wrap[1], new Set())) expr = wrap[1];
  const value = valueInput("VALUE", expr, ctx.vars);
  if (!value) return null;
  return { type: "remote_set_indicator", fields: { NAME: name }, inputs: value };
}

function chunkText(g: Group): string {
  const raws = [g.header.raw, ...g.bodyLines.map((l) => l.raw)];
  // Dedent by header's own indent so nested raw doesn't accumulate leading spaces.
  const baseIndent = g.header.indent;
  const stripped = raws.map((r) => {
    if (baseIndent <= 0) return r;
    let i = 0;
    while (i < baseIndent && i < r.length && (r[i] === " " || r[i] === "\t")) i++;
    return r.slice(i);
  });
  return stripped.join("\n").replace(/\s+$/, "");
}

export function refsInGroup(g: Group): Set<string> {
  const out = new Set<string>();
  const re = /\bdev_([a-d])\b/g;
  const scan = (s: string) => { let m; while ((m = re.exec(s))) out.add(m[1]); };
  scan(g.header.text);
  for (const l of g.bodyLines) scan(l.text);
  return out;
}

/** Try to translate a group. Returns null if not translatable. */
function translateGroup(g: Group, ctx: Ctx): BlockSpec | null {
  const t = g.header.text;

  // Simple hub statements (no dev_x).
  if (g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"))) {
    const block = matchStatement(t);
    if (block) return block;
    const led = matchLedColor(t, ctx.vars);
    if (led) return led;
    const np = matchNeopixelStatement(t, ctx.vars);
    if (np) return np;
    const rs = matchRemoteSend(t, ctx);
    if (rs) return rs;
  }

  // Compound: while
  if (t.startsWith("while ") && t.endsWith(":")) {
    const cond = t.slice(6, -1).trim();
    const condBlock = parseExpr(cond, ctx.vars);
    if (!condBlock) return null;
    const bodyChain = translateBody(g.bodyLines, ctx);
    const inputs: BlockSpec["inputs"] = { BOOL: { block: condBlock } };
    if (bodyChain) inputs.DO = { block: bodyChain };
    return { type: "controls_whileUntil", fields: { MODE: "WHILE" }, inputs };
  }

  // Compound: for X in range(...)
  if (t.startsWith("for ") && t.endsWith(":")) {
    return translateFor(g, ctx);
  }

  // print(x)
  const printMatch = /^print\((.*)\)$/.exec(t);
  if (printMatch && g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"))) {
    const arg = parseExpr(printMatch[1], ctx.vars);
    if (arg) return { type: "text_print", inputs: { TEXT: { block: arg } } };
  }

  // Simple assignment: NAME = expr  (excluding == and multi-target).
  if (g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"))) {
    const asgn = /^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/.exec(t);
    if (asgn) {
      const value = parseExpr(asgn[2], ctx.vars);
      if (value) {
        ctx.vars.add(asgn[1]);
        return { type: "variables_set", fields: { VAR: { id: asgn[1] } }, inputs: { VALUE: { block: value } } };
      }
    }
  }

  return null;
}

function translateFor(g: Group, ctx: Ctx): BlockSpec | null {
  const t = g.header.text;
  // for VAR in range(...)
  const m = /^for\s+([A-Za-z_]\w*)\s+in\s+range\s*\((.*)\)\s*:$/.exec(t);
  if (!m) return null;
  const varName = m[1];
  const argsSrc = m[2];
  const parts = splitTopArgs(argsSrc);
  if (!parts) return null;
  const args = parts.map((s) => parseExpr(s, ctx.vars));
  if (args.some((a) => a === null)) return null;
  const bodyChain = translateBody(g.bodyLines, ctx);
  if (parts.length === 1) {
    // controls_repeat_ext(TIMES=range_arg, DO=body)
    ctx.vars.add(varName);
    const inputs: BlockSpec["inputs"] = { TIMES: { block: args[0]! } };
    if (bodyChain) inputs.DO = { block: bodyChain };
    return { type: "controls_repeat_ext", inputs };
  }
  // 2 or 3 args → controls_for(VAR, FROM, TO, BY, DO); Blockly TO is inclusive,
  // Python range end is exclusive → subtract 1.
  const from = args[0]!;
  const toExclusive = args[1]!;
  const toInclusive: BlockSpec = {
    type: "math_arithmetic",
    fields: { OP: "MINUS" },
    inputs: {
      A: { block: toExclusive },
      B: { block: { type: "math_number", fields: { NUM: "1" } } },
    },
  };
  const by = args[2] ?? { type: "math_number", fields: { NUM: "1" } };
  ctx.vars.add(varName);
  const inputs: BlockSpec["inputs"] = {
    FROM: { block: from },
    TO: { block: toInclusive },
    BY: { block: by },
  };
  if (bodyChain) inputs.DO = { block: bodyChain };
  return {
    type: "controls_for",
    fields: { VAR: { id: varName } },
    inputs,
  };
}

export function splitTopArgs(src: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0 || inStr) return null;
  const last = src.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

/** Translate an if/elif/else chain given the groups that span it. */
function translateIfChain(groups: Group[], startIdx: number, ctx: Ctx): { block: BlockSpec | null; end: number } {
  const branches: { cond: string | null; body: Line[] }[] = [];
  const head = groups[startIdx];
  branches.push({ cond: head.header.text.slice(3, -1).trim(), body: head.bodyLines });
  let i = startIdx + 1;
  while (i < groups.length) {
    const next = groups[i];
    if (next.header.text.startsWith("elif ") && next.header.text.endsWith(":")) {
      branches.push({ cond: next.header.text.slice(5, -1).trim(), body: next.bodyLines });
      i++;
    } else if (next.header.text === "else:") {
      branches.push({ cond: null, body: next.bodyLines });
      i++;
      break;
    } else break;
  }
  const inputs: BlockSpec["inputs"] = {};
  let ifIdx = 0;
  let elseIfCount = 0;
  let hasElse = false;
  for (const b of branches) {
    if (b.cond === null) {
      hasElse = true;
      const body = translateBody(b.body, ctx);
      if (body) inputs.ELSE = { block: body };
    } else {
      const cond = parseExpr(b.cond, ctx.vars);
      if (!cond) return { block: null, end: i };
      inputs[`IF${ifIdx}`] = { block: cond };
      const body = translateBody(b.body, ctx);
      if (body) inputs[`DO${ifIdx}`] = { block: body };
      if (ifIdx > 0) elseIfCount++;
      ifIdx++;
    }
  }
  const block: BlockSpec = { type: "controls_if", inputs };
  if (elseIfCount > 0 || hasElse) {
    block.extraState = { elseIfCount, hasElse };
  }
  return { block, end: i };
}

// ---------------------------------------------------------------------------
// Body / group-list translation
// ---------------------------------------------------------------------------

function translateBody(bodyLines: Line[], ctx: Ctx): BlockSpec | undefined {
  if (bodyLines.length === 0) return undefined;
  // Body indent is the first non-blank line's indent.
  const first = bodyLines.find((l) => l.text !== "" && !l.text.startsWith("#"));
  if (!first) return undefined;
  const baseIndent = first.indent;
  const { groups } = groupAt(bodyLines, 0, bodyLines.length, baseIndent);
  return chain(translateGroups(groups, ctx));
}

export function translateGroups(groups: Group[], ctx: Ctx): BlockSpec[] {
  const specs: BlockSpec[] = [];
  const rawBuffer: string[] = [];
  const flushRaw = () => {
    if (!rawBuffer.length) return;
    const trimmed = rawBuffer.join("\n").replace(/\s+$/, "");
    if (trimmed) specs.push({ type: "raw_python", data: trimmed });
    rawBuffer.length = 0;
  };

  let i = 0;
  while (i < groups.length) {
    const g = groups[i];
    const t = g.header.text;

    // Preamble boilerplate
    if (isPreambleBoilerplate(t) && g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"))) {
      i++;
      continue;
    }

    // NeoPixel helper defs / center hook — skip whole group.
    if (isNeopixelHelperGroup(g)) {
      i++;
      continue;
    }

    // NeoPixel init trio: `hub.ports.X.disable()` [+ `global leds`] +
    // `leds = NeoPixel(machine.Pin(hub.board.PORT_X_ID_N), NUM)` — consume all
    // three as one neopixel_init block. Bare `disable()` (no matching init)
    // falls through to matchStatement -> port_disable.
    const init = tryConsumeNeopixelInit(groups, i, ctx);
    if (init) {
      flushRaw();
      specs.push(init.block);
      i = init.end;
      continue;
    }

    // Device-referencing groups: participate in port-kind + keepRaw logic.
    const refs = refsInGroup(g);
    if (refs.size > 0) {
      const cd = classifyDeviceGroup(g, ctx.portKind);
      const keepRaw = [...refs].some((p) => ctx.keepRaw.has(p));
      if (keepRaw) {
        rawBuffer.push(chunkText(g));
        i++;
        continue;
      }
      if (cd.role === "translatable" && cd.block) {
        flushRaw();
        specs.push(cd.block);
        i++;
        continue;
      }
      if (cd.role === "setup1" || cd.role === "setup2" || cd.role === "setMode" || cd.role === "warn") {
        i++;
        continue;
      }
      // opaque device group but no keepRaw — shouldn't happen; safe fallback.
      rawBuffer.push(chunkText(g));
      i++;
      continue;
    }

    // If chain
    if (t.startsWith("if ") && t.endsWith(":")) {
      const { block, end } = translateIfChain(groups, i, ctx);
      if (block) {
        flushRaw();
        specs.push(block);
        i = end;
        continue;
      }
      // Fallback: emit the entire chain (if + elifs + else) as raw.
      for (let k = i; k < end; k++) rawBuffer.push(chunkText(groups[k]));
      i = end;
      continue;
    }

    // Stray elif/else at top-level = malformed → raw.
    if (t.startsWith("elif ") || t === "else:") {
      rawBuffer.push(chunkText(g));
      i++;
      continue;
    }

    // Try to translate as a single group.
    const block = translateGroup(g, ctx);
    if (block) {
      flushRaw();
      specs.push(block);
    } else {
      rawBuffer.push(chunkText(g));
    }
    i++;
  }
  flushRaw();
  return specs;
}
