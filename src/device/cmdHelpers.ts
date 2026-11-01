/**
 * Binary payload builders and reply parsers for KIND_CMD (0x35) frames.
 * Each Cmd.* function returns a Uint8Array to pass as `args` to DeviceClient.cmd().
 */

export type PortIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
// 0=A  1=B  2=C  3=D  4=E  5=F  6=LED  7=Accel  8=Gyro

export const PORT_IDX: Record<"A" | "B" | "C" | "D" | "E" | "F" | "LED" | "Accel" | "Gyro", PortIdx> = {
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, LED: 6, Accel: 7, Gyro: 8,
};

export const CmdId = {
  MOTOR_START_POWER:      0x01,
  MOTOR_START_SPEED:      0x02,
  MOTOR_START_SPEED_TIME: 0x03,
  MOTOR_START_SPEED_DEG:  0x04,
  MOTOR_GOTO_ABS_POS:     0x05,
  MOTOR_PRESET_ENCODER:   0x06,
  MOTOR_SET_ACC_TIME:     0x07,
  MOTOR_SET_DEC_TIME:     0x08,
  PORT_SET_RGB:           0x09,
  PORT_SET_RGB_IDX:       0x0A,
  PORT_SET_MODE:          0x0B,
  PORT_WRITE_DATA:        0x0C,
  PORT_GET_VALUE:         0x10,
  PORT_GET_DEVICE_TYPE:   0x11,
  PORT_FORCE_DEVICE_TYPE: 0x12,
  HUB_GET_BATTERY:        0x20,
  HUB_GET_BUTTONS:        0x21,
  HUB_GET_ORIENTATION:    0x22,
} as const;

// ── Internal helpers ──────────────────────────────────────────────────────────

function u16be(n: number): [number, number] {
  return [(n >> 8) & 0xFF, n & 0xFF];
}

function u32be(n: number): [number, number, number, number] {
  return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
}

function i32be(n: number): [number, number, number, number] {
  return u32be(n >>> 0);
}

function buf(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

// ── Command payload builders ──────────────────────────────────────────────────

export const Cmd = {
  motorStartPower: (port: PortIdx, power: number) =>
    buf(CmdId.MOTOR_START_POWER, port, power & 0xFF),

  motorStartSpeed: (port: PortIdx, speed: number, maxPower = 100) =>
    buf(CmdId.MOTOR_START_SPEED, port, speed & 0xFF, maxPower),

  motorStartSpeedTime: (port: PortIdx, ms: number, speed: number, maxPower = 100, endState = 0) =>
    buf(CmdId.MOTOR_START_SPEED_TIME, port, ...u16be(ms), speed & 0xFF, maxPower, endState),

  motorStartSpeedDeg: (port: PortIdx, deg: number, speed: number, maxPower = 100, endState = 0) =>
    buf(CmdId.MOTOR_START_SPEED_DEG, port, ...u32be(deg), speed & 0xFF, maxPower, endState),

  motorGotoAbsPos: (port: PortIdx, pos: number, speed: number, maxPower = 100, endState = 0) =>
    buf(CmdId.MOTOR_GOTO_ABS_POS, port, ...i32be(pos), speed, maxPower, endState),

  motorPresetEncoder: (port: PortIdx, pos = 0) =>
    buf(CmdId.MOTOR_PRESET_ENCODER, port, ...i32be(pos)),

  motorSetAccTime: (port: PortIdx, ms: number, profile = 1) =>
    buf(CmdId.MOTOR_SET_ACC_TIME, port, ...u16be(ms), profile),

  motorSetDecTime: (port: PortIdx, ms: number, profile = 1) =>
    buf(CmdId.MOTOR_SET_DEC_TIME, port, ...u16be(ms), profile),

  portSetRgb: (port: PortIdx, r: number, g: number, b: number) =>
    buf(CmdId.PORT_SET_RGB, port, r, g, b),

  portSetRgbIdx: (port: PortIdx, idx: number) =>
    buf(CmdId.PORT_SET_RGB_IDX, port, idx),

  portSetMode: (port: PortIdx, mode: number) =>
    buf(CmdId.PORT_SET_MODE, port, mode),

  portWriteData: (port: PortIdx, mode: number, data: number[]) =>
    buf(CmdId.PORT_WRITE_DATA, port, mode, ...data),

  portGetValue: (port: PortIdx, mode: number, dataset = 0) =>
    buf(CmdId.PORT_GET_VALUE, port, mode, dataset),

  portGetDeviceType: (port: PortIdx) =>
    buf(CmdId.PORT_GET_DEVICE_TYPE, port),

  portForceDeviceType: (port: PortIdx, type: number) =>
    buf(CmdId.PORT_FORCE_DEVICE_TYPE, port, ...u16be(type)),

  hubGetBattery: () =>
    buf(CmdId.HUB_GET_BATTERY),

  hubGetButtons: () =>
    buf(CmdId.HUB_GET_BUTTONS),

  hubGetOrientation: () =>
    buf(CmdId.HUB_GET_ORIENTATION),
} as const;

// ── Reply parsers ─────────────────────────────────────────────────────────────

export const ParseReply = {
  portGetValue(data: Uint8Array): number[] {
    const dv = new DataView(data.buffer, data.byteOffset);
    const out: number[] = [];
    for (let i = 0; i + 4 <= data.length; i += 4) {
      out.push(dv.getFloat32(i, true));
    }
    return out;
  },

  portGetDeviceType(data: Uint8Array): number {
    return new DataView(data.buffer, data.byteOffset).getUint16(0, false);
  },

  hubGetBattery(data: Uint8Array): { mv: number; pct: number } {
    const dv = new DataView(data.buffer, data.byteOffset);
    return { mv: dv.getUint16(0, false), pct: data[2] };
  },

  hubGetButtons(data: Uint8Array): Record<"center" | "up" | "down" | "left" | "right", boolean> {
    const m = data[0];
    return {
      center: !!(m & 1),
      up:     !!(m & 2),
      down:   !!(m & 4),
      left:   !!(m & 8),
      right:  !!(m & 16),
    };
  },

  hubGetOrientation(data: Uint8Array): { pitch: number; yaw: number; roll: number } {
    const dv = new DataView(data.buffer, data.byteOffset);
    return {
      pitch: dv.getFloat32(0, true),
      yaw:   dv.getFloat32(4, true),
      roll:  dv.getFloat32(8, true),
    };
  },
};
