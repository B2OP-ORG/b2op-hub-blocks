import { dec, enc } from "./framing";

// ── REMOTE (kind 0x1D) ────────────────────────────────────────────────────────

export const REMOTE_OP = { DEFINE: 0x01, SET: 0x02, CLEAR: 0x03 } as const;

/** Slot value type; the number is the wire encoding. */
export const RemoteType = { Int: 0, Float: 1, Bool: 2, Str: 3 } as const;
export type RemoteType = typeof RemoteType[keyof typeof RemoteType];
export type RemoteValue = number | boolean | string;

/** Max name bytes (UTF-8) and Str value bytes. */
export const REMOTE_MAX_NAME = 32;
export const REMOTE_MAX_STR = 255;
/** Payload bytes per REMOTE frame we send / the device sends (device frame buffer is 2 KiB). */
const REMOTE_FRAME_PAYLOAD = 480;

export interface RemoteDef { id: number; type: RemoteType; name: string; }
export interface RemoteSetEntry { id: number; type: RemoteType; value: RemoteValue; }

/** Unsolicited REMOTE frame from the device (program messages), decoded. */
export type RemoteEvent =
  | { op: "define"; defs: RemoteDef[] }
  | { op: "set"; values: { id: number; value: RemoteValue }[] }
  /** `ids` empty = forget every message. */
  | { op: "clear"; ids: number[] };
export type RemoteSink = (event: RemoteEvent) => void;

/** Default value of a slot type (what the device starts a slot at). */
export function remoteDefault(type: RemoteType): RemoteValue {
  return type === RemoteType.Bool ? false : type === RemoteType.Str ? "" : 0;
}

export function checkRemoteId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id > 255) throw new RangeError(`REMOTE: bad id ${id}`);
}

/** Encoded `[id][type][name_len][name]` DEFINE entry. Throws on a bad name / type / id. */
export function encodeRemoteDef(d: RemoteDef): Uint8Array {
  checkRemoteId(d.id);
  if (!Number.isInteger(d.type) || d.type < 0 || d.type > 3) throw new RangeError(`REMOTE: bad type ${d.type}`);
  const name = enc.encode(d.name);
  if (name.length < 1 || name.length > REMOTE_MAX_NAME) throw new RangeError(`REMOTE: bad name "${d.name}"`);
  const out = new Uint8Array(3 + name.length);
  out[0] = d.id;
  out[1] = d.type;
  out[2] = name.length;
  out.set(name, 3);
  return out;
}

/** Encoded value by slot type (Int i32 BE, Float f32 LE, Bool u8, Str [len][UTF-8]). */
export function encodeRemoteValue(type: RemoteType, value: RemoteValue): Uint8Array {
  switch (type) {
    case RemoteType.Int: {
      const n = Math.round(Number(value) || 0);
      const out = new Uint8Array(4);
      new DataView(out.buffer).setInt32(0, Math.max(-0x80000000, Math.min(0x7FFFFFFF, n)), false);
      return out;
    }
    case RemoteType.Float: {
      const out = new Uint8Array(4);
      new DataView(out.buffer).setFloat32(0, Number(value) || 0, true);
      return out;
    }
    case RemoteType.Bool:
      return Uint8Array.of(value ? 1 : 0);
    case RemoteType.Str: {
      let s = enc.encode(String(value));
      if (s.length > REMOTE_MAX_STR) {
        // Cut at a UTF-8 boundary so the device's validator accepts it.
        let end = REMOTE_MAX_STR;
        while (end > 0 && (s[end] & 0xC0) === 0x80) end--;
        s = s.subarray(0, end);
      }
      const out = new Uint8Array(1 + s.length);
      out[0] = s.length;
      out.set(s, 1);
      return out;
    }
    default:
      throw new RangeError(`REMOTE: bad type ${type as number}`);
  }
}

/** Encoded `[id][value]` SET entry. */
export function encodeRemoteSet(e: RemoteSetEntry): Uint8Array {
  checkRemoteId(e.id);
  const v = encodeRemoteValue(e.type, e.value);
  const out = new Uint8Array(1 + v.length);
  out[0] = e.id;
  out.set(v, 1);
  return out;
}

/** Pack entries after `op` into payloads of ≤ `max` bytes (an entry never splits). */
export function packRemote(op: number, entries: Uint8Array[], max = REMOTE_FRAME_PAYLOAD): Uint8Array[] {
  const out: Uint8Array[] = [];
  let cur: Uint8Array[] = [];
  let len = 1;
  const flush = () => {
    const p = new Uint8Array(len);
    p[0] = op;
    let off = 1;
    for (const e of cur) { p.set(e, off); off += e.length; }
    out.push(p);
    cur = [];
    len = 1;
  };
  for (const e of entries) {
    if (cur.length && len + e.length > max) flush();
    cur.push(e);
    len += e.length;
  }
  if (cur.length) flush();
  return out;
}

/**
 * Decode a device REMOTE frame. SET values are decoded with `types` (message
 * id → type, kept by the caller from earlier DEFINEs); a SET entry for an
 * unknown id ends the frame (its length is unknown). Null for a bad op.
 */
export function decodeRemote(payload: Uint8Array, types: ReadonlyMap<number, RemoteType>): RemoteEvent | null {
  if (payload.length < 1) return null;
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let i = 1;
  switch (payload[0]) {
    case REMOTE_OP.DEFINE: {
      const defs: RemoteDef[] = [];
      while (i + 3 <= payload.length) {
        const id = payload[i], type = payload[i + 1], nlen = payload[i + 2];
        i += 3;
        if (type > 3 || i + nlen > payload.length) break;
        defs.push({ id, type: type as RemoteType, name: dec.decode(payload.subarray(i, i + nlen)) });
        i += nlen;
      }
      return { op: "define", defs };
    }
    case REMOTE_OP.SET: {
      const values: { id: number; value: RemoteValue }[] = [];
      while (i < payload.length) {
        const id = payload[i++];
        const type = types.get(id);
        if (type === undefined) break;
        if (type === RemoteType.Str) {
          if (i >= payload.length || i + 1 + payload[i] > payload.length) break;
          values.push({ id, value: dec.decode(payload.subarray(i + 1, i + 1 + payload[i])) });
          i += 1 + payload[i];
        } else if (type === RemoteType.Bool) {
          if (i >= payload.length) break;
          values.push({ id, value: payload[i++] !== 0 });
        } else {
          if (i + 4 > payload.length) break;
          values.push({ id, value: type === RemoteType.Int ? dv.getInt32(i, false) : dv.getFloat32(i, true) });
          i += 4;
        }
      }
      return { op: "set", values };
    }
    case REMOTE_OP.CLEAR:
      return { op: "clear", ids: Array.from(payload.subarray(1)) };
    default:
      return null;
  }
}
