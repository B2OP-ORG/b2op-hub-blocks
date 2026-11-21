import type { Group } from "./lines";
import { matchDeviceStatement } from "./statements";
import { type BlockSpec, CLASS_TO_KIND, DEVICE_KINDS, type DeviceKind } from "./types";

// ---------------------------------------------------------------------------
// Device-group classification (used for boilerplate skipping / keepRaw)
// ---------------------------------------------------------------------------

type DeviceRole = "setup1" | "setup2" | "setMode" | "warn" | "translatable" | "opaque";

export function classifyDeviceGroup(g: Group, portKind: Map<string, DeviceKind>): { role: DeviceRole; block?: BlockSpec; port?: string; kind?: DeviceKind } {
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
