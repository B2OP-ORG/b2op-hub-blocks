import type { PythonGenerator } from "blockly/python";

export type Port = "A" | "B" | "C" | "D";
export type DeviceKind =
  | "color_sensor"
  | "distance_sensor"
  | "color_distance_sensor"
  | "motor"
  | "basic_motor";

/** MicroPython class name in `lpf2.devices` for each internal DeviceKind slug. */
export const DEVICE_CLASS: Record<DeviceKind, string> = {
  motor: "encoder_motor",
  basic_motor: "basic_motor",
  color_sensor: "color_sensor",
  distance_sensor: "distance_sensor",
  color_distance_sensor: "color_distance_sensor",
};

/** Metadata registered per port during generator dispatch. */
interface Registration {
  kind: DeviceKind;
  /** Extra one-liners appended after the isinstance guard (e.g. setMode). */
  extras: Set<string>;
  /** Collision — a second block requested a different kind on this port. */
  collidedWith?: DeviceKind;
}

const KEY_LPF2_IMPORT = "hub_lpf2_import";
const KEY_DEVICES_IMPORT = "hub_devices_import";
const KEY_SETUP_PREFIX = "hub_setup_";
const KEY_LVGL_IMPORT = "lvgl_import";
const KEY_TIME_IMPORT = "time_import";

const state = new Map<Port, Registration>();

export function resetSetup(): void {
  state.clear();
}

export function needsLpf2(gen: PythonGenerator): void {
  (gen as unknown as { definitions_: Record<string, string> }).definitions_[KEY_LPF2_IMPORT] = "import hub, lpf2";
}

export function needsDevices(gen: PythonGenerator): void {
  needsLpf2(gen);
  (gen as unknown as { definitions_: Record<string, string> }).definitions_[KEY_DEVICES_IMPORT] = "from lpf2 import devices";
}

/** LVGL setup — hub.lcd.init() must run before `import lvgl`. */
export function needsLvgl(gen: PythonGenerator): void {
  needsLpf2(gen);
  (gen as unknown as { definitions_: Record<string, string> }).definitions_[KEY_LVGL_IMPORT] =
    "hub.lcd.init()\nimport lvgl as lv\n_scr = lv.screen_active()";
}

export function needsTime(gen: PythonGenerator): void {
  (gen as unknown as { definitions_: Record<string, string> }).definitions_[KEY_TIME_IMPORT] = "import time";
}

/**
 * Register a typed-device setup for `port` of `kind`. Idempotent per (port,kind).
 * Second call with a different kind on the same port keeps the first and marks
 * a collision (comment emitted, only the first kind's guard used).
 *
 * `extraSetupLine` (optional) is deduped-appended after the isinstance guard.
 */
export function registerDevice(
  gen: PythonGenerator,
  port: Port,
  kind: DeviceKind,
  extraSetupLine?: string,
): string {
  needsDevices(gen);
  let reg = state.get(port);
  if (!reg) {
    reg = { kind, extras: new Set() };
    state.set(port, reg);
  } else if (reg.kind !== kind && !reg.collidedWith) {
    reg.collidedWith = kind;
  }
  if (extraSetupLine && reg.kind === kind) reg.extras.add(extraSetupLine);
  emit(gen, port, reg);
  return devVar(port);
}

export function devVar(port: Port): string {
  return `dev_${port.toLowerCase()}`;
}

function emit(gen: PythonGenerator, port: Port, reg: Registration): void {
  const varName = devVar(port);
  const lines: string[] = [];
  if (reg.collidedWith) {
    lines.push(`# WARN: port ${port} used as ${reg.kind} and ${reg.collidedWith}; keeping ${reg.kind}`);
  }
  const className = DEVICE_CLASS[reg.kind];
  lines.push(`${varName} = hub.ports.${port}.device()`);
  lines.push(`if not isinstance(${varName}, devices.${className}):`);
  lines.push(`    raise TypeError(${JSON.stringify(`Port ${port}: expected ${reg.kind}`)})`);
  for (const extra of reg.extras) lines.push(extra);
  (gen as unknown as { definitions_: Record<string, string> }).definitions_[`${KEY_SETUP_PREFIX}${port}`] = lines.join("\n");
}
