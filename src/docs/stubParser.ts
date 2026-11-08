// Minimal, indentation-based parser for `.pyi` stub files. Extracts what the
// Docs tab needs — names, signatures, docstrings — without a real Python AST.
// Stubs are machine-friendly (one statement per line, bodies are `...`), so a
// line-oriented scan is enough.

export interface ApiFunction {
  kind: "function";
  name: string;
  /** Parameter list incl. parentheses, plus ` -> T` when annotated. */
  signature: string;
  /** Extra signatures from `@overload` variants. */
  overloads: string[];
  decorators: string[];
  doc: string;
}

export interface ApiAttribute {
  kind: "attribute";
  name: string;
  type?: string;
  value?: string;
  doc: string;
}

export interface ApiClass {
  kind: "class";
  name: string;
  bases: string[];
  doc: string;
  members: ApiMember[];
}

export type ApiMember = ApiFunction | ApiAttribute | ApiClass;

export interface ParsedModule {
  doc: string;
  members: ApiMember[];
  /** Local alias → fully qualified name, from `from X import Y as Z`. */
  imports: Record<string, string>;
}

interface LogicalLine {
  indent: number;
  text: string;
}

/** Strip a trailing `#` comment that is outside any string literal. */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (line.startsWith(quote, i)) { i += quote.length - 1; quote = null; }
      continue;
    }
    if (c === "#") return line.slice(0, i).trimEnd();
    if (c === '"' || c === "'") quote = line.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
    if (quote && quote.length === 3) i += 2;
  }
  return line;
}

/** Count `(`/`[`/`{` depth change on a line, ignoring string contents. */
function depthDelta(line: string): number {
  let d = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if ("([{".includes(c)) d++;
    else if (")]}".includes(c)) d--;
  }
  return d;
}

const TRIPLE = /^[rRuUbB]?("""|''')/;

/** Join physical lines into logical statements (brackets, triple-quoted strings). */
export function logicalLines(src: string): LogicalLine[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: LogicalLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;

    // Docstring / bare string statement, possibly multi-line.
    const tq = TRIPLE.exec(trimmed);
    if (tq) {
      const q = tq[1];
      const start = trimmed.indexOf(q) + 3;
      const parts: string[] = [];
      let rest = trimmed.slice(start);
      let j = i;
      for (;;) {
        const end = rest.indexOf(q);
        if (end !== -1) { parts.push(rest.slice(0, end)); break; }
        parts.push(rest);
        j++;
        if (j >= lines.length) break;
        rest = lines[j];
      }
      i = j;
      out.push({ indent, text: '"""' + parts.join("\n") });
      continue;
    }

    let text = stripComment(trimmed);
    let depth = depthDelta(text);
    while (depth > 0 && i + 1 < lines.length) {
      i++;
      const next = stripComment(lines[i].trim());
      text += (text.endsWith("(") || text.endsWith("[") || next.startsWith(")") || next.startsWith("]") ? "" : " ") + next;
      depth += depthDelta(next);
    }
    if (text) out.push({ indent, text });
  }
  return out;
}

/** Python `inspect.cleandoc`: drop common indentation, trim blank edges. */
export function cleanDoc(doc: string): string {
  const lines = doc.replace(/\t/g, "    ").split("\n");
  let margin = Infinity;
  for (const l of lines.slice(1)) {
    const s = l.trimStart();
    if (s) margin = Math.min(margin, l.length - s.length);
  }
  const out = [lines[0].trim(), ...lines.slice(1).map((l) => (margin === Infinity ? l : l.slice(margin)).trimEnd())];
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n");
}

const isDoc = (l: LogicalLine | undefined): l is LogicalLine => !!l && l.text.startsWith('"""');
const docOf = (l: LogicalLine) => cleanDoc(l.text.slice(3));

const DEF_RE = /^(?:async\s+)?def\s+(\w+)\s*(\(.*\))\s*(?:->\s*(.+?))?\s*:\s*(.*)$/;
const CLASS_RE = /^class\s+(\w+)\s*(?:\((.*)\))?\s*:\s*(.*)$/;
const ATTR_RE = /^(\w+)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/;
const FROM_RE = /^from\s+([\w.]+)\s+import\s+\(?(.+?)\)?$/;

interface Ctx {
  lines: LogicalLine[];
  i: number;
  imports: Record<string, string>;
  pkg: string;
}

/** Strip `self` / `cls` from a method's parameter list. */
function dropSelf(params: string): string {
  return params.replace(/^\(\s*(self|cls)\s*(,\s*|(?=\)))/, "(");
}

function resolveRelative(mod: string, pkg: string): string {
  if (!mod.startsWith(".")) return mod;
  const dots = /^\.+/.exec(mod)![0].length;
  const base = pkg.split(".").slice(0, pkg.split(".").length - (dots - 1)).join(".");
  const rest = mod.slice(dots);
  return rest ? `${base}.${rest}` : base;
}

/** Parse statements at `indent` until a dedent. */
function parseBlock(ctx: Ctx, indent: number, inClass: boolean): ApiMember[] {
  const members: ApiMember[] = [];
  let decorators: string[] = [];
  const byName = new Map<string, ApiFunction>();

  while (ctx.i < ctx.lines.length) {
    const line = ctx.lines[ctx.i];
    if (line.indent < indent) break;
    if (line.indent > indent) { ctx.i++; continue; } // stray body (e.g. under `if`)
    const t = line.text;
    ctx.i++;

    if (t.startsWith("@")) { decorators.push(t.slice(1).trim()); continue; }

    const fm = FROM_RE.exec(t);
    if (fm) {
      const mod = resolveRelative(fm[1], ctx.pkg);
      for (const part of fm[2].split(",")) {
        const [name, alias] = part.trim().split(/\s+as\s+/);
        if (name && name !== "*") ctx.imports[(alias ?? name).trim()] = `${mod}.${name.trim()}`;
      }
      continue;
    }
    if (/^(import|if|else|elif|try|except|finally|pass|\.\.\.|return|raise)\b/.test(t) || t.startsWith('"""')) {
      // Skip bodies of control blocks.
      if (t.endsWith(":")) while (ctx.i < ctx.lines.length && ctx.lines[ctx.i].indent > indent) ctx.i++;
      decorators = [];
      continue;
    }

    const dm = DEF_RE.exec(t);
    if (dm) {
      const [, name, rawParams, ret, inlineBody] = dm;
      const params = inClass && !decorators.includes("staticmethod") ? dropSelf(rawParams) : rawParams;
      const signature = params + (ret ? ` -> ${ret.trim()}` : "");
      let doc = "";
      if (!inlineBody) {
        const next = ctx.lines[ctx.i];
        if (next && next.indent > indent) {
          if (isDoc(next)) doc = docOf(next);
          while (ctx.i < ctx.lines.length && ctx.lines[ctx.i].indent > indent) ctx.i++;
        }
      }
      const isOverload = decorators.includes("overload") || decorators.includes("typing.overload");
      const existing = byName.get(name);
      if (existing && existing.decorators.includes("overload")) {
        // Further @overload variants add signatures; the trailing
        // implementation only contributes its docstring.
        if (isOverload) existing.overloads.push(signature);
        if (!existing.doc) existing.doc = doc;
      } else {
        const fn: ApiFunction = { kind: "function", name, signature, overloads: [], decorators: decorators.filter((d) => d !== "overload"), doc };
        if (isOverload) fn.decorators.push("overload");
        byName.set(name, fn);
        members.push(fn);
      }
      decorators = [];
      continue;
    }

    const cm = CLASS_RE.exec(t);
    if (cm) {
      const [, name, bases, inlineBody] = cm;
      const cls: ApiClass = {
        kind: "class",
        name,
        bases: bases ? bases.split(",").map((b) => b.trim()).filter((b) => b && !b.includes("=")) : [],
        doc: "",
        members: [],
      };
      if (!inlineBody) {
        const next = ctx.lines[ctx.i];
        if (next && next.indent > indent) {
          const bodyIndent = next.indent;
          if (isDoc(next)) { cls.doc = docOf(next); ctx.i++; }
          cls.members = parseBlock(ctx, bodyIndent, true);
        }
      }
      members.push(cls);
      decorators = [];
      continue;
    }

    const am = ATTR_RE.exec(t);
    if (am) {
      const [, name, type, value] = am;
      const attr: ApiAttribute = { kind: "attribute", name, type: type?.trim(), value: value?.trim(), doc: "" };
      const next = ctx.lines[ctx.i];
      if (isDoc(next) && next.indent === indent) { attr.doc = docOf(next); ctx.i++; }
      members.push(attr);
    }
    decorators = [];
  }
  // Overload-only functions keep the first variant as the main signature.
  for (const fn of byName.values()) fn.decorators = fn.decorators.filter((d) => d !== "overload");
  return members;
}

/** Parse one stub file. `moduleName` is used to resolve relative imports. */
export function parseStub(src: string, moduleName: string, isPackage: boolean): ParsedModule {
  const lines = logicalLines(src);
  const ctx: Ctx = { lines, i: 0, imports: {}, pkg: isPackage ? moduleName : moduleName.split(".").slice(0, -1).join(".") };
  let doc = "";
  if (isDoc(lines[0]) && lines[0].indent === 0) { doc = docOf(lines[0]); ctx.i = 1; }
  const members = parseBlock(ctx, 0, false);
  return { doc, members, imports: ctx.imports };
}
