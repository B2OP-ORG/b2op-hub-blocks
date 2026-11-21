import { DEVICE_CLASS, type DeviceKind } from "../../blocks/setup";

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

export const COLOR_NAMES = new Set([
  "BLACK", "PINK", "PURPLE", "BLUE", "LIGHTBLUE", "CYAN",
  "GREEN", "YELLOW", "ORANGE", "RED", "WHITE", "NONE",
]);
export const LOG_LEVELS = new Set(["0", "1", "2", "3"]);
export const ACCEL_PROFILES = new Set(["0", "1"]);

export type { DeviceKind };

export const DEVICE_KINDS = new Set(Object.keys(DEVICE_CLASS) as DeviceKind[]);

/** Reverse of DEVICE_CLASS: MicroPython class name → internal DeviceKind slug. */
export const CLASS_TO_KIND: Record<string, DeviceKind> = Object.fromEntries(
  Object.entries(DEVICE_CLASS).map(([kind, cls]) => [cls, kind as DeviceKind]),
);
