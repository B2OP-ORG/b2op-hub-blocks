import type { StateCreator } from "zustand";
import type { DeviceClient } from "../../device/deviceClient";
import type { AppState, ConnectionState, ConsoleEntry } from "./types";

const MAX_CONSOLE = 500;

/** Connection, console and live device readings. */
export interface DeviceSlice {
  device: DeviceClient | null;
  connection: ConnectionState;
  connectionError: string | null;
  running: boolean;
  console: ConsoleEntry[];
  boardName: string;
  boardVersion: string;
  fwVersion: string;
  deviceName: string;

  // ── Live device state ───────────────────────────────────────────────────
  batteryMv: number;
  batteryPct: number;
  buttonState: Record<string, boolean>;
  orientation: { pitch: number; yaw: number; roll: number };
  sensorValues: Record<string, number[]>;
  deviceType: Record<string, number>;

  setDevice: (d: DeviceClient | null) => void;
  setConnection: (s: ConnectionState, err?: string) => void;
  setRunning: (r: boolean) => void;
  appendConsole: (kind: ConsoleEntry["kind"], text: string) => void;
  clearConsole: () => void;
  setBoardInfo: (name: string, version: string, fwVersion: string) => void;
  setDeviceName: (n: string) => void;

  setBattery: (mv: number, pct: number) => void;
  setButtonState: (state: Record<string, boolean>) => void;
  setOrientation: (o: { pitch: number; yaw: number; roll: number }) => void;
  setSensorValue: (port: string, vals: number[]) => void;
  setDeviceType: (port: string, t: number) => void;
}

export const createDeviceSlice: StateCreator<AppState, [], [], DeviceSlice> = (set) => ({
  device: null,
  connection: "disconnected",
  connectionError: null,
  running: false,
  console: [],
  boardName: "",
  boardVersion: "",
  fwVersion: "",
  deviceName: "",

  batteryMv: 0,
  batteryPct: 0,
  buttonState: {},
  orientation: { pitch: 0, yaw: 0, roll: 0 },
  sensorValues: {},
  deviceType: {},

  setDevice: (device) => set({ device }),
  setConnection: (connection, err) => set({ connection, connectionError: err ?? null }),
  setBoardInfo: (boardName, boardVersion, fwVersion) => set({ boardName, boardVersion, fwVersion }),
  setDeviceName: (deviceName) => set({ deviceName }),
  setRunning: (running) => set({ running }),

  appendConsole: (kind, text) =>
    set((s) => {
      const next = s.console.length >= MAX_CONSOLE
        ? s.console.slice(s.console.length - MAX_CONSOLE + 1)
        : s.console.slice();
      next.push({ ts: Date.now(), kind, text });
      return { console: next };
    }),

  clearConsole: () => set({ console: [] }),

  setBattery: (batteryMv, batteryPct) => set({ batteryMv, batteryPct }),
  setButtonState: (buttonState) => set({ buttonState }),
  setOrientation: (orientation) => set({ orientation }),
  setSensorValue: (port, vals) => set((s) => ({ sensorValues: { ...s.sensorValues, [port]: vals } })),
  setDeviceType: (port, t) => set((s) => ({ deviceType: { ...s.deviceType, [port]: t } })),
});
