import { REMOTE_GET_BLOCK, remoteValueKind } from "../../blocks/remoteKinds";
import { REMOTE_MODULE_NAMES } from "../../remote/layout";
import { findSymbol } from "../../remote/registry";
import { type BlockSpec, COLOR_NAMES } from "./types";

// ---------------------------------------------------------------------------
// Expression tokenizer + parser
// ---------------------------------------------------------------------------

type ETok = { kind: "NUM" | "STR" | "NAME" | "KW" | "OP"; value: string };

const KEYWORDS = new Set(["and", "or", "not", "True", "False", "None", "in", "is"]);

function lexExpr(src: string): ETok[] | null {
  const toks: ETok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ kind: "NUM", value: src.slice(i, j) });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ kind: KEYWORDS.has(w) ? "KW" : "NAME", value: w });
      i = j; continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let value = "";
      while (j < src.length && src[j] !== q) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const esc = src[j + 1];
          if (esc === "n") value += "\n";
          else if (esc === "t") value += "\t";
          else value += esc;
          j += 2;
        } else {
          value += src[j];
          j++;
        }
      }
      if (j >= src.length) return null;
      toks.push({ kind: "STR", value });
      i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (["**", "//", "==", "!=", "<=", ">="].includes(two)) {
      toks.push({ kind: "OP", value: two });
      i += 2; continue;
    }
    if ("+-*/%<>()[],.=".includes(c)) {
      toks.push({ kind: "OP", value: c });
      i++; continue;
    }
    return null;
  }
  return toks;
}

class ExprParser {
  pos = 0;
  private toks: ETok[];
  private vars: Set<string>;
  constructor(toks: ETok[], vars: Set<string>) {
    this.toks = toks;
    this.vars = vars;
  }

  peek(o = 0): ETok | undefined { return this.toks[this.pos + o]; }
  match(kind: string, value?: string): boolean {
    const t = this.peek();
    return !!t && t.kind === kind && (value === undefined || t.value === value);
  }
  eat(kind: string, value?: string): boolean {
    if (this.match(kind, value)) { this.pos++; return true; }
    return false;
  }
  atEnd(): boolean { return this.pos >= this.toks.length; }

  parseRemote(): BlockSpec | null {
    return parseRemoteRead(this);
  }

  parseLpf2Color(): BlockSpec | null {
    return parseLpf2ColorRead(this);
  }

  parse(): BlockSpec | null {
    const r = this.parseOr();
    if (!r || !this.atEnd()) return null;
    return r;
  }

  parseOr(): BlockSpec | null {
    let left = this.parseAnd();
    if (!left) return null;
    while (this.match("KW", "or")) {
      this.pos++;
      const right = this.parseAnd();
      if (!right) return null;
      left = {
        type: "logic_operation",
        fields: { OP: "OR" },
        inputs: { A: { block: left }, B: { block: right } },
      };
    }
    return left;
  }
  parseAnd(): BlockSpec | null {
    let left = this.parseNot();
    if (!left) return null;
    while (this.match("KW", "and")) {
      this.pos++;
      const right = this.parseNot();
      if (!right) return null;
      left = {
        type: "logic_operation",
        fields: { OP: "AND" },
        inputs: { A: { block: left }, B: { block: right } },
      };
    }
    return left;
  }
  parseNot(): BlockSpec | null {
    if (this.match("KW", "not")) {
      this.pos++;
      const arg = this.parseNot();
      if (!arg) return null;
      return { type: "logic_negate", inputs: { BOOL: { block: arg } } };
    }
    return this.parseCompare();
  }
  parseCompare(): BlockSpec | null {
    const left = this.parseAdd();
    if (!left) return null;
    const cmpMap: Record<string, string> = {
      "==": "EQ", "!=": "NEQ", "<": "LT", "<=": "LTE", ">": "GT", ">=": "GTE",
    };
    const t = this.peek();
    if (t && t.kind === "OP" && cmpMap[t.value]) {
      this.pos++;
      const right = this.parseAdd();
      if (!right) return null;
      return {
        type: "logic_compare",
        fields: { OP: cmpMap[t.value] },
        inputs: { A: { block: left }, B: { block: right } },
      };
    }
    return left;
  }
  parseAdd(): BlockSpec | null {
    let left = this.parseMul();
    if (!left) return null;
    while (true) {
      if (this.match("OP", "+")) {
        this.pos++;
        const right = this.parseMul();
        if (!right) return null;
        left = { type: "math_arithmetic", fields: { OP: "ADD" }, inputs: { A: { block: left }, B: { block: right } } };
      } else if (this.match("OP", "-")) {
        this.pos++;
        const right = this.parseMul();
        if (!right) return null;
        left = { type: "math_arithmetic", fields: { OP: "MINUS" }, inputs: { A: { block: left }, B: { block: right } } };
      } else break;
    }
    return left;
  }
  parseMul(): BlockSpec | null {
    let left = this.parseUnary();
    if (!left) return null;
    while (true) {
      if (this.match("OP", "*")) {
        this.pos++;
        const right = this.parseUnary();
        if (!right) return null;
        left = { type: "math_arithmetic", fields: { OP: "MULTIPLY" }, inputs: { A: { block: left }, B: { block: right } } };
      } else if (this.match("OP", "/")) {
        this.pos++;
        const right = this.parseUnary();
        if (!right) return null;
        left = { type: "math_arithmetic", fields: { OP: "DIVIDE" }, inputs: { A: { block: left }, B: { block: right } } };
      } else if (this.match("OP", "%")) {
        this.pos++;
        const right = this.parseUnary();
        if (!right) return null;
        left = { type: "math_modulo", inputs: { DIVIDEND: { block: left }, DIVISOR: { block: right } } };
      } else break;
    }
    return left;
  }
  parseUnary(): BlockSpec | null {
    if (this.match("OP", "-")) {
      this.pos++;
      const arg = this.parseUnary();
      if (!arg) return null;
      return { type: "math_single", fields: { OP: "NEG" }, inputs: { NUM: { block: arg } } };
    }
    if (this.match("OP", "+")) {
      this.pos++;
      return this.parseUnary();
    }
    return this.parsePow();
  }
  parsePow(): BlockSpec | null {
    const base = this.parseAtom();
    if (!base) return null;
    if (this.match("OP", "**")) {
      this.pos++;
      const exp = this.parseUnary();
      if (!exp) return null;
      return { type: "math_arithmetic", fields: { OP: "POWER" }, inputs: { A: { block: base }, B: { block: exp } } };
    }
    return base;
  }
  parseAtom(): BlockSpec | null {
    const t = this.peek();
    if (!t) return null;
    if (t.kind === "NUM") { this.pos++; return { type: "math_number", fields: { NUM: t.value } }; }
    if (t.kind === "STR") { this.pos++; return { type: "text", fields: { TEXT: t.value } }; }
    if (t.kind === "KW" && (t.value === "True" || t.value === "False")) {
      this.pos++;
      return { type: "logic_boolean", fields: { BOOL: t.value.toUpperCase() } };
    }
    if (t.kind === "OP" && t.value === "(") {
      this.pos++;
      const inner = this.parseOr();
      if (!inner) return null;
      if (!this.eat("OP", ")")) return null;
      return inner;
    }
    if (t.kind === "OP" && t.value === "[") {
      this.pos++;
      const items: BlockSpec[] = [];
      if (!this.match("OP", "]")) {
        while (true) {
          const item = this.parseOr();
          if (!item) return null;
          items.push(item);
          if (this.match("OP", ",")) { this.pos++; continue; }
          break;
        }
      }
      if (!this.eat("OP", "]")) return null;
      const inputs: BlockSpec["inputs"] = {};
      items.forEach((it, i) => { inputs![`ADD${i}`] = { block: it }; });
      return {
        type: "lists_create_with",
        extraState: { itemCount: items.length },
        inputs,
      };
    }
    if (t.kind === "NAME") {
      const name = t.value;
      this.pos++;
      if (name === "remote" && this.match("OP", ".")) return this.parseRemote();
      if (name === "lpf2" && this.match("OP", ".")) return this.parseLpf2Color();
      if (this.match("OP", "(")) {
        this.pos++;
        const args: BlockSpec[] = [];
        if (!this.match("OP", ")")) {
          while (true) {
            const a = this.parseOr();
            if (!a) return null;
            args.push(a);
            if (this.match("OP", ",")) { this.pos++; continue; }
            break;
          }
        }
        if (!this.eat("OP", ")")) return null;
        return callToBlock(name, args);
      }
      this.vars.add(name);
      return { type: "variables_get", fields: { VAR: { id: name } } };
    }
    return null;
  }
}

/** `lpf2.color.<NAME>` after `lpf2` was consumed (at "."). */
function parseLpf2ColorRead(p: ExprParser): BlockSpec | null {
  if (!p.eat("OP", ".")) return null;
  const mod = p.peek();
  if (!mod || mod.kind !== "NAME" || mod.value !== "color") return null;
  p.pos++;
  if (!p.eat("OP", ".")) return null;
  const c = p.peek();
  if (!c || c.kind !== "NAME" || !COLOR_NAMES.has(c.value)) return null;
  p.pos++;
  return { type: "color_literal", fields: { COLOR: c.value } };
}

/** `remote.<name>` / `remote.get("name")` after `remote` was consumed (at "."). */
function parseRemoteRead(p: ExprParser): BlockSpec | null {
  if (!p.eat("OP", ".")) return null;
  const attr = p.peek();
  if (!attr || attr.kind !== "NAME") return null;
  p.pos++;
  if (attr.value === "get") {
    if (!p.eat("OP", "(")) return null;
    const arg = p.peek();
    if (!arg || arg.kind !== "STR") return null;
    p.pos++;
    if (!p.eat("OP", ")")) return null; // a default value has no block form
    return remoteGetBlock(arg.value);
  }
  if (REMOTE_MODULE_NAMES.has(attr.value) || p.match("OP", "(")) return null;
  return remoteGetBlock(attr.value);
}

/** Reporter for control `name`, typed by the layout (number when undefined). */
function remoteGetBlock(name: string): BlockSpec {
  const sym = findSymbol("control", name);
  return { type: REMOTE_GET_BLOCK[sym ? remoteValueKind(sym.type) : "number"], fields: { NAME: name } };
}

function callToBlock(name: string, args: BlockSpec[]): BlockSpec | null {
  if (name === "len" && args.length === 1) {
    return { type: "lists_length", inputs: { VALUE: { block: args[0] } } };
  }
  return null;
}

export function parseExpr(src: string, vars: Set<string>): BlockSpec | null {
  const toks = lexExpr(src.trim());
  if (!toks) return null;
  return new ExprParser(toks, vars).parse();
}
