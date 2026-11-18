// Type-only imports: protocol.ts imports this module at runtime.
import type { KIND } from "./protocol";
import type { CmdId } from "./cmdHelpers";

/**
 * Per-minor-version feature table for protocol major 1.
 *
 * Each entry lists every message type (KIND) and CMD subtype (CmdId) with a
 * boolean saying whether a device speaking that minor version supports it.
 * The Record types force every KIND / CmdId to appear, so adding a new
 * constant fails to compile until each minor's table says whether it has it.
 */

export type KindName = keyof typeof KIND;
export type CmdName = keyof typeof CmdId;

export interface ProtoFeatures {
  kinds: Record<KindName, boolean>;
  cmds: Record<CmdName, boolean>;
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
};

/** Index = minor version. */
export const PROTO_FEATURES: readonly ProtoFeatures[] = [
  PROTO_1_0,
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
