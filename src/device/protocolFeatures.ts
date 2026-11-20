// Type-only imports: protocol.ts imports this module at runtime.
import type { KIND } from "./protocol";
import type { CmdId } from "./cmdHelpers";

/**
 * Per-minor-version feature table for protocol major 1.
 *
 * Each entry lists every message type (KIND), CMD subtype (CmdId) and
 * capability flag with a boolean saying whether a device speaking that minor
 * version supports it. The Record types force every KIND / CmdId / flag to
 * appear, so adding a new one fails to compile until each minor's table says
 * whether it has it.
 */

export type KindName = keyof typeof KIND;
export type CmdName = keyof typeof CmdId;

/**
 * Device capabilities that change how the host may use existing messages
 * (no new KIND / CmdId). Not to be confused with the frame FLAGS byte.
 *   FAST_UPLOAD  UPLOAD DATA may go as one BLE write-without-response per
 *                frame: 8 KiB BLE RX ring, 32-chunk reorder window (1.1).
 */
export type FlagName = "FAST_UPLOAD";

export interface ProtoFeatures {
  kinds: Record<KindName, boolean>;
  cmds: Record<CmdName, boolean>;
  flags: Record<FlagName, boolean>;
}

const PROTO_1_0: ProtoFeatures = {
  kinds: {
    HELLO_REQ:  true,
    PING:       true,
    MTU_REQ:    true,
    RUN:        true,
    STOP:       true,
    UPLOAD:     true,
    READ:       true,
    LS:         true,
    MV:         true,
    CP:         true,
    RM:         true,
    MKDIR:      true,
    ABORT:      true,
    ECHO_BLE:   true,
    REMOTE:     false,
    HELLO:      true,
    OK:         true,
    ERR:        true,
    ACK:        true,
    PROGRESS:   true,
    DATA:       true,
    STDOUT:     true,
    STDERR:     true,
    PROG_END:   true,
    PROG_START: true,
    EXEC:       true,
    CMD:        true,
  },
  cmds: {
    MOTOR_START_POWER:      true,
    MOTOR_START_SPEED:      true,
    MOTOR_START_SPEED_TIME: true,
    MOTOR_START_SPEED_DEG:  true,
    MOTOR_GOTO_ABS_POS:     true,
    MOTOR_PRESET_ENCODER:   true,
    MOTOR_SET_ACC_TIME:     true,
    MOTOR_SET_DEC_TIME:     true,
    PORT_SET_RGB:           true,
    PORT_SET_RGB_IDX:       true,
    PORT_SET_MODE:          true,
    PORT_WRITE_DATA:        true,
    PORT_GET_VALUE:         true,
    PORT_GET_DEVICE_TYPE:   true,
    PORT_FORCE_DEVICE_TYPE: true,
    HUB_GET_BATTERY:        true,
    HUB_GET_BUTTONS:        true,
    HUB_GET_ORIENTATION:    true,
  },
  flags: {
    FAST_UPLOAD: false,
  },
};

const PROTO_1_1: ProtoFeatures = {
  kinds: { ...PROTO_1_0.kinds },
  cmds:  { ...PROTO_1_0.cmds },
  flags: {
    FAST_UPLOAD: true,
  },
};

/**
 * 1.2: REMOTE kind (controls for the `remote` module + program messages).
 * The device also honours FLAGS NO_ACK from 1.2 on (older firmware replied
 * anyway); the host never waits for NO_ACK replies, so that needs no flag.
 */
const PROTO_1_2: ProtoFeatures = {
  kinds: { ...PROTO_1_1.kinds, REMOTE: true },
  cmds:  { ...PROTO_1_1.cmds },
  flags: { ...PROTO_1_1.flags },
};

/** Index = minor version. */
export const PROTO_FEATURES: readonly ProtoFeatures[] = [
  PROTO_1_0,
  PROTO_1_1,
  PROTO_1_2,
];

/**
 * Feature set for a device's HELLO proto_ver. A minor newer than this app
 * knows maps to the newest known table (minors are backwards compatible).
 */
export function protoFeatures(protoVer: number): ProtoFeatures {
  const minor = (protoVer >>> 16) & 0xFF; // proto_ver = major<<24 | minor<<16 | patch
  return PROTO_FEATURES[Math.min(minor, PROTO_FEATURES.length - 1)];
}

export function supportsKind(protoVer: number, kind: KindName): boolean {
  return protoFeatures(protoVer).kinds[kind];
}

export function supportsCmd(protoVer: number, cmd: CmdName): boolean {
  return protoFeatures(protoVer).cmds[cmd];
}

export function supportsFlag(protoVer: number, flag: FlagName): boolean {
  return protoFeatures(protoVer).flags[flag];
}
