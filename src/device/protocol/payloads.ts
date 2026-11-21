import { KIND } from "./constants";
import { dec, enc } from "./framing";
import type { DirEntry, EchoFrame } from "./types";
import { KIND_NAMES } from "./version";

// ── Utility helpers ───────────────────────────────────────────────────────────


/** One-line description of an echoed BLE frame, for the console. */
export function formatEchoFrame(f: EchoFrame): string {
  const name = KIND_NAMES.get(f.kind) ?? `0x${f.kind.toString(16).padStart(2, "0")}`;
  const arrow = f.direction === "rx" ? "host→hub" : "hub→host";
  const seq = f.seq.toString(16).padStart(2, "0");
  const p = f.payload;
  let detail = `${p.length}B`;
  if (f.kind === KIND.ERR || f.kind === KIND.STDOUT || f.kind === KIND.STDERR || f.kind === KIND.PROG_START
      || (f.direction === "rx" && [KIND.RUN, KIND.READ, KIND.LS, KIND.RM, KIND.MKDIR, KIND.EXEC].includes(f.kind as never))) {
    detail = JSON.stringify(dec.decode(p.subarray(0, 64)));
  } else if (f.kind === KIND.DATA && p.length >= 4) {
    detail = `off=${new DataView(p.buffer, p.byteOffset, 4).getUint32(0, false)} len=${p.length - 4}`;
  }
  return `[BLE ${arrow}] ${name} seq=${seq} ${detail}`;
}

export function encodeTwoPaths(src: string, dst: string): Uint8Array {
  const s = enc.encode(src);
  const d = enc.encode(dst);
  if (s.length > 255 || d.length > 255) throw new Error("path too long");
  const out = new Uint8Array(1 + s.length + 1 + d.length);
  out[0] = s.length;
  out.set(s, 1);
  out[1 + s.length] = d.length;
  out.set(d, 2 + s.length);
  return out;
}

export function parseLsPayload(payload: Uint8Array): DirEntry[] {
  const entries: DirEntry[] = [];
  let i = 0;
  while (i < payload.length) {
    const isDir = payload[i++] !== 0;
    // Find null terminator
    let j = i;
    while (j < payload.length && payload[j] !== 0) j++;
    const name = dec.decode(payload.slice(i, j));
    if (name) entries.push({ name, isDir });
    i = j + 1;
  }
  return entries;
}

/** Inverse of encodeTwoPaths (used by the mock hub). */
export function decodeTwoPaths(payload: Uint8Array): [string, string] | null {
  if (payload.length < 1) return null;
  const srcLen = payload[0];
  if (1 + srcLen + 1 > payload.length) return null;
  const src = dec.decode(payload.subarray(1, 1 + srcLen));
  const dstLen = payload[1 + srcLen];
  if (1 + srcLen + 1 + dstLen > payload.length) return null;
  const dst = dec.decode(payload.subarray(1 + srcLen + 1, 1 + srcLen + 1 + dstLen));
  return [src, dst];
}
