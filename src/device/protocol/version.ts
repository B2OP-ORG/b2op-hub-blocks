import { CmdId } from "../cmdHelpers";
import type { CmdName, KindName } from "../protocolFeatures";
import { KIND } from "./constants";

/** Protocol major version this app implements (any 1.x device is accepted). */
export const SUPPORTED_PROTO_MAJOR = 1;

export interface ProtoVersion { major: number; minor: number; patch: number; }

/** HELLO proto_ver: one u32 BE = major<<24 | minor<<16 | patch (patch: low 16 bits). */
export function parseProtoVersion(v: number): ProtoVersion {
  return { major: (v >>> 24) & 0xFF, minor: (v >>> 16) & 0xFF, patch: v & 0xFFFF };
}

export function formatProtoVersion(v: number): string {
  const { major, minor, patch } = parseProtoVersion(v);
  return `${major}.${minor}.${patch}`;
}

/**
 * null when this app can talk to a device with protocol version `v`, else a
 * user-facing reason. 0 = pre-1.0.0 firmware (single proto_ver byte).
 */
export function protoVersionError(v: number): string | null {
  const { major } = parseProtoVersion(v);
  if (major === SUPPORTED_PROTO_MAJOR) return null;
  const shown = v === 0 ? "older than 1.0.0" : `v${formatProtoVersion(v)}`;
  return major < SUPPORTED_PROTO_MAJOR
    ? `Unsupported device protocol ${shown}. Please update the hub firmware.`
    : `Unsupported device protocol ${shown}. Please update the app.`;
}

// ── Feature gating ────────────────────────────────────────────────────────────

export const KIND_NAMES = new Map<number, KindName>(
  (Object.entries(KIND) as [KindName, number][]).map(([k, v]) => [v, k]),
);
export const CMD_NAMES = new Map<number, CmdName>(
  (Object.entries(CmdId) as [CmdName, number][]).map(([k, v]) => [v, k]),
);

/** Request blocked locally: the hub's protocol minor doesn't implement it. */
export class UnsupportedFeatureError extends Error {
  readonly feature: KindName | CmdName;
  constructor(feature: KindName | CmdName, protoVer: number) {
    super(`${feature} is not supported by the hub firmware (protocol v${formatProtoVersion(protoVer)}). Please update the hub firmware.`);
    this.name = "UnsupportedFeatureError";
    this.feature = feature;
  }
}
