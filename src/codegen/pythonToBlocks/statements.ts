import { parseExpr } from "./expr";
import type { Group } from "./lines";
import { type Ctx, REMOTE_DECL_RE, splitTopArgs } from "./translate";
import { ACCEL_PROFILES, type BlockSpec, type DeviceKind, LOG_LEVELS } from "./types";

// ---------------------------------------------------------------------------
// Statement-level: stateless top-level patterns (no dev_x involved)
// ---------------------------------------------------------------------------

function numInput(name: string, expr: string) {
  return { [name]: { shadow: { type: "math_number", fields: { NUM: expr } } as BlockSpec } };
}

export function matchStatement(line: string): BlockSpec | null {
  let m: RegExpExecArray | null;
  if ((m = /^hub\.led\.setColor\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(line))) {
    return { type: "hub_led_rgb", inputs: { ...numInput("R", m[1]), ...numInput("G", m[2]), ...numInput("B", m[3]) } };
  }
  if ((m = /^time\.sleep\((-?\d+(?:\.\d+)?)\)$/.exec(line))) {
    return { type: "hub_wait", inputs: numInput("SECONDS", m[1]) };
  }
  if (line === "hub.imu.reset()") return { type: "hub_imu_reset" };
  if (line === "hub.powerOff()") return { type: "hub_poweroff" };
  if (line === "hub.exit()") return { type: "hub_quit" };
  if (line === "hub.stop_callbacks()") return { type: "hub_stop_callbacks" };
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

export function valueInput(name: string, expr: string, vars: Set<string>): Record<string, { block?: BlockSpec; shadow?: BlockSpec }> | null {
  const b = parseExpr(expr, vars);
  if (!b) return null;
  const shadow: BlockSpec = { type: "math_number", fields: { NUM: "0" } };
  if (b.type === "math_number") return { [name]: { shadow: b } };
  return { [name]: { block: b, shadow } };
}

/** `hub.led.setColorIdx(<expr>)` → set-hub-LED block (colour-word shadow). */
export function matchLedColor(line: string, vars: Set<string>): BlockSpec | null {
  const m = /^hub\.led\.setColorIdx\((.+)\)$/.exec(line);
  if (!m) return null;
  const b = parseExpr(m[1], vars);
  if (!b) return null;
  const shadow: BlockSpec = { type: "color_literal", fields: { COLOR: "BLUE" } };
  return { type: "hub_led_color", inputs: { COLOR: b.type === "color_literal" ? { shadow: b } : { block: b, shadow } } };
}

/**
 * NeoPixel statement matchers that need expression parsing. Kept separate from
 * `matchStatement` because they use `ctx.vars` via the caller.
 */
export function matchNeopixelStatement(line: string, vars: Set<string>): BlockSpec | null {
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

export function matchDeviceStatement(line: string, portKind: Map<string, DeviceKind>): BlockSpec | null {
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

export function isPreambleBoilerplate(line: string): boolean {
  if (line === "") return true;
  if (line === "pass") return true;
  if (/^import\s/.test(line)) return true;
  if (/^from\s/.test(line)) return true;
  if (/^#\s*b2op-hub-blocks\s+v/.test(line)) return true;
  if (REMOTE_DECL_RE.test(line)) return true;
  if (line === "hub.lcd.init()") return true;
  if (line === "_scr = lv.screen_active()") return true;
  if (line === "leds = None") return true;
  if (line === "global leds") return true;
  return false;
}

export function bodyEmpty(g: Group): boolean {
  return g.bodyLines.every((l) => l.text === "" || l.text.startsWith("#"));
}

/**
 * If groups[i..] starts with `hub.ports.X.disable()` followed (optionally) by
 * `global leds` and then `leds = NeoPixel(machine.Pin(hub.board.PORT_X_ID_N), NUM)`,
 * consume all matched groups and return a `neopixel_init` block. Otherwise null.
 */
export function tryConsumeNeopixelInit(groups: Group[], i: number, ctx: Ctx): { block: BlockSpec; end: number } | null {
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
export function isNeopixelHelperGroup(g: Group): boolean {
  const t = g.header.text;
  if (/^def _neopixel_hsv_to_rgb\(/.test(t)) return true;
  if (/^def _neopixel_draw_rainbow\(/.test(t)) return true;
  return false;
}
