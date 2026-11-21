// Port list, LPF2 device type names and colours for the Device panel.

import { PORT_IDX, type PortIdx } from "../../device/cmdHelpers";
import type { Palette } from "../theme";

export const PORTS: Array<{ name: string; idx: PortIdx }> = [
  { name: "A", idx: PORT_IDX.A },
  { name: "B", idx: PORT_IDX.B },
  { name: "C", idx: PORT_IDX.C },
  { name: "D", idx: PORT_IDX.D },
  { name: "E", idx: PORT_IDX.E },
  { name: "F", idx: PORT_IDX.F },
  { name: "LED", idx: PORT_IDX.LED },
  { name: "Accel", idx: PORT_IDX.Accel },
  { name: "Gyro", idx: PORT_IDX.Gyro },
];

const MOTORS = new Set([1, 2, 38, 39, 41, 46, 47, 48, 49, 75, 76, 100, 101]);
const SENSORS = new Set([37, 43, 61, 62, 63]);
const IMU = new Set([57, 58, 59, 40, 54]);

const DEVICE_NAMES: Record<number, string> = {
  1: "Simple Motor", 2: "Train Motor", 8: "Light",
  20: "Voltage", 21: "Current", 22: "Buzzer", 23: "Hub LED",
  34: "Tilt", 35: "Motion", 37: "Color+Dist",
  38: "Medium Motor", 39: "MoveHub Motor", 40: "MoveHub Tilt",
  41: "Duplo Motor", 46: "Large Linear", 47: "XL Linear",
  48: "Medium Angular", 49: "Large Angular", 54: "Gesture",
  55: "Remote Btn", 56: "Remote RSSI", 57: "Accel", 58: "Gyro",
  59: "Tilt", 60: "Temp", 61: "Color", 62: "Distance",
  63: "Force", 75: "Medium Angular (Grey)", 76: "Large Angular (Grey)",
  100: "EV3 Medium", 101: "EV3 Large",
};

/** Display name of an attached device type (hex id when unknown). */
export function deviceName(type: number): string {
  return DEVICE_NAMES[type] ?? `0x${type.toString(16).padStart(4, "0")}`;
}

/** Colour by device class: motors blue, sensors green, hub LED amber, IMU cyan. */
export function portColor(type: number): string {
  if (!type) return "#3a5a64";
  if (MOTORS.has(type)) return "#60a5fa";
  if (SENSORS.has(type)) return "#4ade80";
  if (type === 23) return "#fbbf24";
  if (IMU.has(type)) return "#67e8f9";
  return "#dff5fb";
}

/** Red (0%) → green (100%). */
export function batteryColor(pct: number): string {
  const hue = Math.round((pct / 100) * 120);
  return `hsl(${hue}, 85%, 48%)`;
}

/** Panel colours (headings, values, separators). */
export function deviceColors(p: Palette) {
  return {
    heading: p.dark ? "#4cc3ff" : "#0e7490",
    value: p.dark ? "#a0d8e8" : "#0b3b48",
    sep: p.dark ? "#132a34" : "#cfe7ee",
  };
}
