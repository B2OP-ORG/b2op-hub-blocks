export const enc = new TextEncoder();
export const dec = new TextDecoder("utf-8", { fatal: false });

// ── Varint helpers ────────────────────────────────────────────────────────────

export function encodeVarint(n: number): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const b = n & 0x7F;
    n >>>= 7;
    if (n === 0) { out.push(b); return new Uint8Array(out); }
    out.push(b | 0x80);
  }
  out.push(n & 0xFF); // 5th byte
  return new Uint8Array(out);
}

/** Returns [value, newOffset]. Throws if data ends mid-varint. */
export function decodeVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  for (let i = 0; i < 4; i++) {
    if (offset + i >= buf.length) throw new RangeError("varint truncated");
    const b = buf[offset + i];
    result |= (b & 0x7F) << shift;
    shift += 7;
    if (!(b & 0x80)) return [result, offset + i + 1];
  }
  if (offset + 4 >= buf.length) throw new RangeError("varint truncated");
  result |= buf[offset + 4] << shift;
  return [result, offset + 5];
}

// ── Frame builder ─────────────────────────────────────────────────────────────

export function makeFrame(
  kind: number,
  seq: number,
  flags: number,
  payload: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const lenBytes = encodeVarint(payload.length);
  const frame = new Uint8Array(1 + lenBytes.length + 3 + payload.length);
  frame[0] = 0x7E;
  frame.set(lenBytes, 1);
  frame[1 + lenBytes.length]     = seq;
  frame[1 + lenBytes.length + 1] = flags;
  frame[1 + lenBytes.length + 2] = kind;
  frame.set(payload, 1 + lenBytes.length + 3);
  return frame;
}
