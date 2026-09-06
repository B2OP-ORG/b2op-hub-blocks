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
 *
 * Anything unsupported becomes a `raw_python` block so the code still runs.
 */

export interface BlockSpec {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockSpec; shadow?: BlockSpec }>;
  data?: string;
  extraState?: unknown;
  next?: { block: BlockSpec };
}

export interface ButtonHat {
  btn: string;
  chain: BlockSpec | undefined;
}

export interface Translation {
  main: BlockSpec | undefined;
  buttonHats: ButtonHat[];
  variables: { name: string; id: string }[];
}

const COLOR_NAMES = new Set([
  "BLACK", "PINK", "PURPLE", "BLUE", "LIGHTBLUE", "CYAN",
  "GREEN", "YELLOW", "ORANGE", "RED", "WHITE", "NONE",
]);
const LOG_LEVELS = new Set(["0", "1", "2", "3"]);
const ACCEL_PROFILES = new Set(["0", "1"]);

type DeviceKind =
  | "color_sensor"
  | "distance_sensor"
  | "color_distance_sensor"
  | "motor"
  | "basic_motor";
const DEVICE_KINDS = new Set<DeviceKind>([
  "color_sensor",
  "distance_sensor",
  "color_distance_sensor",
  "motor",
  "basic_motor",
]);

/** Reverse of DEVICE_CLASS: MicroPython class name → internal DeviceKind slug. */
const CLASS_TO_KIND: Record<string, DeviceKind> = {
  encoder_motor: "motor",
  basic_motor: "basic_motor",
  color_sensor: "color_sensor",
  distance_sensor: "distance_sensor",
  color_distance_sensor: "color_distance_sensor",
};

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

function callToBlock(name: string, args: BlockSpec[]): BlockSpec | null {
  if (name === "len" && args.length === 1) {
    return { type: "lists_length", inputs: { VALUE: { block: args[0] } } };
  }
  return null;
}

function parseExpr(src: string, vars: Set<string>): BlockSpec | null {
  const toks = lexExpr(src.trim());
  if (!toks) return null;
  return new ExprParser(toks, vars).parse();
}

// ---------------------------------------------------------------------------
// Statement-level: stateless top-level patterns (no dev_x involved)
// ---------------------------------------------------------------------------

function numInput(name: string, expr: string) {
  return { [name]: { shadow: { type: "math_number", fields: { NUM: expr } } as BlockSpec } };
}

function matchStatement(line: string): BlockSpec | null {
  let m: RegExpExecArray | null;
  if ((m = /^hub\.led\.setColorIdx\(lpf2\.color\.([A-Z]+)\)$/.exec(line))) {
    if (COLOR_NAMES.has(m[1])) return { type: "hub_led_color", fields: { COLOR: m[1] } };
  }
  if ((m = /^hub\.led\.setColor\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(line))) {
    return { type: "hub_led_rgb", inputs: { ...numInput("R", m[1]), ...numInput("G", m[2]), ...numInput("B", m[3]) } };
  }
  if ((m = /^time\.sleep\((-?\d+(?:\.\d+)?)\)$/.exec(line))) {
    return { type: "hub_wait", inputs: numInput("SECONDS", m[1]) };
  }
  if (line === "hub.imu.reset()") return { type: "hub_imu_reset" };
  if (line === "hub.powerOff()") return { type: "hub_poweroff" };
  if (line === "hub.exit()") return { type: "hub_quit" };
  if ((m = /^hub\.log\.setLevel\((\d)\)$/.exec(line))) {
    if (LOG_LEVELS.has(m[1])) return { type: "hub_log_level", fields: { LEVEL: m[1] } };
  }
  if ((m = /^hub\.lcd\.(on|off)\(\)$/.exec(line))) {
    return { type: "hub_lcd_backlight", fields: { STATE: m[1] } };
  }
  if ((m = /^hub\.lcd\.backlight\((-?\d+)\)$/.exec(line))) {
    return { type: "hub_lcd_backlight_duty", inputs: numInput("DUTY", m[1]) };
  }
  if ((m = /^hub\.lcd\.fill\((-?\d+)\)$/.exec(line))) {
    return { type: "hub_lcd_fill", inputs: numInput("COLOR", m[1]) };
  }
  if ((m = /^hub\.ports\.([A-D])\.disable\(\)$/.exec(line))) {
    return { type: "port_disable", fields: { PORT: m[1] } };
  }
  if ((m = /^hub\.ports\.([A-D])\.disable\(False\)$/.exec(line))) {
    return { type: "port_enable", fields: { PORT: m[1] } };
  }
  if (line === "leds.write()") return { type: "neopixel_write" };
  return null;
}

function valueInput(name: string, expr: string, vars: Set<string>): Record<string, { block?: BlockSpec; shadow?: BlockSpec }> | null {
  const b = parseExpr(expr, vars);
  if (!b) return null;
  const shadow: BlockSpec = { type: "math_number", fields: { NUM: "0" } };
  if (b.type === "math_number") return { [name]: { shadow: b } };
  return { [name]: { block: b, shadow } };
}

/**
 * NeoPixel statement matchers that need expression parsing. Kept separate from
 * `matchStatement` because they use `ctx.vars` via the caller.
 */
function matchNeopixelStatement(line: string, vars: Set<string>): BlockSpec | null {
  let m: RegExpExecArray | null;
  if ((m = /^leds\[(.+)\]\s*=\s*_neopixel_hsv_to_rgb\((.+)\)$/.exec(line))) {
    const args = splitTopArgs(m[2]);
    if (args && args.length === 3) {
      const idx = valueInput("INDEX", m[1], vars);
      const h = valueInput("H", args[0], vars);
      const s = valueInput("S", args[1], vars);
      const v = valueInput("V", args[2], vars);
      if (idx && h && s && v) return { type: "neopixel_set_hsv", inputs: { ...idx, ...h, ...s, ...v } };
    }
  }
  if ((m = /^leds\[(.+)\]\s*=\s*\((.+)\)$/.exec(line))) {
    const args = splitTopArgs(m[2]);
    if (args && args.length === 3) {
      const idx = valueInput("INDEX", m[1], vars);
      const r = valueInput("R", args[0], vars);
      const g = valueInput("G", args[1], vars);
      const b = valueInput("B", args[2], vars);
      if (idx && r && g && b) return { type: "neopixel_set_rgb", inputs: { ...idx, ...r, ...g, ...b } };
    }
  }
  if ((m = /^leds\.fill\(\((.+)\)\)$/.exec(line))) {
    const args = splitTopArgs(m[1]);
    if (args && args.length === 3) {
      const r = valueInput("R", args[0], vars);
      const g = valueInput("G", args[1], vars);
      const b = valueInput("B", args[2], vars);
      if (r && g && b) return { type: "neopixel_fill", inputs: { ...r, ...g, ...b } };
    }
  }
  if ((m = /^_neopixel_draw_rainbow\(leds,\s*(.+)\)$/.exec(line))) {
    const args = splitTopArgs(m[1]);
    if (args && args.length === 4) {
      const s = valueInput("START", args[0], vars);
      const st = valueInput("STEP", args[1], vars);
      const sa = valueInput("SAT", args[2], vars);
      const v = valueInput("VAL", args[3], vars);
      if (s && st && sa && v) return { type: "neopixel_rainbow", inputs: { ...s, ...st, ...sa, ...v } };
    }
  }
  return null;
}

function matchDeviceStatement(line: string, portKind: Map<string, DeviceKind>): BlockSpec | null {
  let m: RegExpExecArray | null;
  const kindOf = (portUpper: string) => portKind.get(portUpper.toLowerCase());
  const withPort = (re: RegExp): { port: string; groups: string[] } | null => {
    m = re.exec(line);
    if (!m) return null;
    return { port: m[1].toUpperCase(), groups: m.slice(1) };
  };
  let r;
  if ((r = withPort(/^dev_([a-d])\.startSpeed\((-?\d+)\)$/))) {
    if (kindOf(r.port) === "motor")
      return { type: "motor_start_speed", fields: { PORT: r.port }, inputs: numInput("SPEED", r.groups[1]) };
  }
  if ((r = withPort(/^dev_([a-d])\.startPower\((-?\d+)\)$/))) {
    const k = kindOf(r.port);
    const power = r.groups[1];
    if (k === "motor") {
      if (power === "0") return { type: "motor_stop", fields: { PORT: r.port } };
      return { type: "motor_start_power", fields: { PORT: r.port }, inputs: numInput("POWER", power) };
    }
    if (k === "basic_motor")
      return { type: "basic_motor_power", fields: { PORT: r.port }, inputs: numInput("POWER", power) };
  }
  if ((r = withPort(/^dev_([a-d])\.startSpeedForTime\((-?\d+),\s*(-?\d+)\)$/))) {
    if (kindOf(r.port) === "motor")
      return { type: "motor_run_for_time", fields: { PORT: r.port }, inputs: { ...numInput("MS", r.groups[1]), ...numInput("SPEED", r.groups[2]) } };
  }
  if ((r = withPort(/^dev_([a-d])\.startSpeedForDegrees\((-?\d+),\s*(-?\d+)\)$/))) {
    if (kindOf(r.port) === "motor")
      return { type: "motor_run_for_degrees", fields: { PORT: r.port }, inputs: { ...numInput("DEG", r.groups[1]), ...numInput("SPEED", r.groups[2]) } };
  }
  if ((r = withPort(/^dev_([a-d])\.gotoAbsPosition\((-?\d+),\s*(-?\d+)\)$/))) {
    if (kindOf(r.port) === "motor")
      return { type: "motor_goto_position", fields: { PORT: r.port }, inputs: { ...numInput("DEG", r.groups[1]), ...numInput("SPEED", r.groups[2]) } };
  }
  if ((r = withPort(/^dev_([a-d])\.presetEncoder\(0\)$/))) {
    if (kindOf(r.port) === "motor") return { type: "motor_reset_encoder", fields: { PORT: r.port } };
  }
  if ((r = withPort(/^dev_([a-d])\.setAccTime\((-?\d+),\s*(\d)\)$/))) {
    if (kindOf(r.port) === "motor" && ACCEL_PROFILES.has(r.groups[2]))
      return { type: "motor_set_acc_time", fields: { PORT: r.port, PROFILE: r.groups[2] }, inputs: numInput("MS", r.groups[1]) };
  }
  if ((r = withPort(/^dev_([a-d])\.setDecTime\((-?\d+),\s*(\d)\)$/))) {
    if (kindOf(r.port) === "motor" && ACCEL_PROFILES.has(r.groups[2]))
      return { type: "motor_set_dec_time", fields: { PORT: r.port, PROFILE: r.groups[2] }, inputs: numInput("MS", r.groups[1]) };
  }
  if ((r = withPort(/^dev_([a-d])\.setLight\((-?\d+),\s*(-?\d+),\s*(-?\d+)\)$/))) {
    if (kindOf(r.port) === "color_sensor")
      return { type: "color_set_light", fields: { PORT: r.port }, inputs: { ...numInput("L1", r.groups[1]), ...numInput("L2", r.groups[2]), ...numInput("L3", r.groups[3]) } };
  }
  if ((r = withPort(/^dev_([a-d])\.setLight\((-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\)$/))) {
    if (kindOf(r.port) === "distance_sensor")
      return { type: "distance_set_light", fields: { PORT: r.port }, inputs: { ...numInput("L1", r.groups[1]), ...numInput("L2", r.groups[2]), ...numInput("L3", r.groups[3]), ...numInput("L4", r.groups[4]) } };
  }
  return null;
}

function isPreambleBoilerplate(line: string): boolean {
  if (line === "") return true;
  if (line === "pass") return true;
  if (/^import\s/.test(line)) return true;
  if (/^from\s/.test(line)) return true;
  if (/^#\s*b2op-hub-blocks\s+v/.test(line)) return true;
  if (line === "hub.lcd.init()") return true;
  if (line === "_scr = lv.screen_active()") return true;
  if (line === "leds = None") return true;
  if (line === "global leds") return true;
  return false;
}

function bodyEmpty(g: Group): boolean {
  return g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"));
}

/**
 * If groups[i..] starts with `hub.ports.X.disable()` followed (optionally) by
 * `global leds` and then `leds = NeoPixel(machine.Pin(hub.board.PORT_X_ID_N), NUM)`,
 * consume all matched groups and return a `neopixel_init` block. Otherwise null.
 */
function tryConsumeNeopixelInit(groups: Group[], i: number, ctx: Ctx): { block: BlockSpec; end: number } | null {
  const first = groups[i];
  if (!first || !bodyEmpty(first)) return null;
  const disM = /^hub\.ports\.([A-D])\.disable\(\)$/.exec(first.header.text);
  if (!disM) return null;
  const port = disM[1];
  let j = i + 1;
  if (j < groups.length && groups[j].header.text === "global leds" && bodyEmpty(groups[j])) j++;
  if (j >= groups.length || !bodyEmpty(groups[j])) return null;
  const initRe = new RegExp(`^leds\\s*=\\s*NeoPixel\\(machine\\.Pin\\(hub\\.board\\.PORT_${port}_ID_(\\d)\\)\\s*,\\s*(.+)\\)$`);
  const initM = initRe.exec(groups[j].header.text);
  if (!initM) return null;
  const pin = initM[1];
  const numInputs = valueInput("NUM", initM[2], ctx.vars);
  if (!numInputs) return null;
  return {
    block: { type: "neopixel_init", fields: { PORT: port, PIN: pin }, inputs: numInputs },
    end: j + 1,
  };
}

/** Groups whose entire header+body form NeoPixel helper defs. */
function isNeopixelHelperGroup(g: Group): boolean {
  const t = g.header.text;
  if (/^def _neopixel_hsv_to_rgb\(/.test(t)) return true;
  if (/^def _neopixel_draw_rainbow\(/.test(t)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Line parsing + statement grouping (indent-aware)
// ---------------------------------------------------------------------------

interface Line {
  indent: number;
  text: string;
  raw: string;
}

interface Group {
  header: Line;
  bodyLines: Line[];   // raw indented body lines (may contain nested compound headers)
}

function parseLines(source: string): Line[] {
  return source.replace(/\r\n?/g, "\n").split("\n").map((raw) => {
    const m = /^([ \t]*)/.exec(raw)!;
    const indent = m[1].replace(/\t/g, "    ").length;
    return { indent, text: raw.replace(/^[ \t]+/, "").replace(/\s+$/, ""), raw };
  });
}

/**
 * Group a flat line list into top-level statements at `baseIndent`.
 * Blank / comment lines are attached to the preceding group's body when
 * inside a body, else discarded.
 */
function groupAt(lines: Line[], start: number, end: number, baseIndent: number): { groups: Group[] } {
  const groups: Group[] = [];
  let i = start;
  while (i < end) {
    const L = lines[i];
    if (L.text === "" || L.text.startsWith("#")) { i++; continue; }
    if (L.indent < baseIndent) break;
    if (L.indent > baseIndent) { i++; continue; } // shouldn't happen at proper base
    const g: Group = { header: L, bodyLines: [] };
    let j = i + 1;
    while (j < end) {
      const N = lines[j];
      if (N.text === "" || N.text.startsWith("#")) {
        g.bodyLines.push(N);
        j++;
        continue;
      }
      if (N.indent > baseIndent) { g.bodyLines.push(N); j++; }
      else break;
    }
    groups.push(g);
    i = j;
  }
  return { groups };
}

// ---------------------------------------------------------------------------
// Compound-statement translation
// ---------------------------------------------------------------------------

interface Ctx {
  portKind: Map<string, DeviceKind>;
  keepRaw: Set<string>;
  vars: Set<string>;
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

function refsInGroup(g: Group): Set<string> {
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
    const np = matchNeopixelStatement(t, ctx.vars);
    if (np) return np;
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

function splitTopArgs(src: string): string[] | null {
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

function translateGroups(groups: Group[], ctx: Ctx): BlockSpec[] {
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

// ---------------------------------------------------------------------------
// Device-group classification (used for boilerplate skipping / keepRaw)
// ---------------------------------------------------------------------------

type DeviceRole = "setup1" | "setup2" | "setMode" | "warn" | "translatable" | "opaque";

function classifyDeviceGroup(g: Group, portKind: Map<string, DeviceKind>): { role: DeviceRole; block?: BlockSpec; port?: string; kind?: DeviceKind } {
  const bodyEmpty = g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"));

  // Single-line: setup1 / setMode / warn / device statement.
  if (bodyEmpty) {
    const line = g.header.text;
    let m: RegExpExecArray | null;
    if ((m = /^dev_([a-d])\s*=\s*hub\.ports\.[A-D]\.device\(\)$/.exec(line))) {
      return { role: "setup1", port: m[1] };
    }
    if (/^dev_[a-d]\.setMode\(/.test(line)) {
      const p = /\bdev_([a-d])\b/.exec(line)?.[1];
      return { role: "setMode", port: p };
    }
    if (/^# WARN: port [A-D] used as/.test(line)) {
      const p = /port ([A-D])/.exec(line)?.[1]?.toLowerCase();
      return { role: "warn", port: p };
    }
    const block = matchDeviceStatement(line, portKind);
    if (block) {
      const p = /\bdev_([a-d])\b/.exec(line)?.[1];
      return { role: "translatable", block, port: p };
    }
    return { role: "opaque" };
  }

  // Multi-line body: isinstance guard?
  const first = g.header.text;
  const second = g.bodyLines.find((l) => l.text !== "" && !l.text.startsWith("#"))?.text ?? "";
  const m = /^if not isinstance\(dev_([a-d]), devices\.(\w+)\):$/.exec(first);
  if (m && /^raise TypeError\(/.test(second)) {
    const className = m[2];
    const kind = CLASS_TO_KIND[className] ?? (DEVICE_KINDS.has(className as DeviceKind) ? (className as DeviceKind) : undefined);
    if (kind) {
      const nonTrivial = g.bodyLines.filter((l) => l.text !== "" && !l.text.startsWith("#"));
      if (nonTrivial.length === 1) return { role: "setup2", port: m[1], kind };
    }
  }
  return { role: "opaque" };
}

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

function chain(specs: BlockSpec[]): BlockSpec | undefined {
  if (specs.length === 0) return undefined;
  for (let i = specs.length - 1; i > 0; i--) {
    specs[i - 1].next = { block: specs[i] };
  }
  return specs[0];
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const VERSION_RE = /^#\s*b2op-hub-blocks\s+v2\.\d+\.\d+\s*$/;

export function pythonToBlocks(source: string): Translation {
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
