// Frame builders for the mock hub (device → host replies).

import { KIND, enc, makeFrame } from "../protocol";

/** Protocol 1.2.0 as sent in HELLO: u32 BE major<<24 | minor<<16 | patch. */
const PROTO_VER = 0x01020000;
const BOARD_NAME = "MockHub";
const BOARD_VERSION = "1.0.0";
const FW_VERSION = "v1.1.0";

export function frameOk(seq: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  return makeFrame(KIND.OK, seq, 0, payload);
}
export function frameErr(seq: number, msg: string): Uint8Array {
  return makeFrame(KIND.ERR, seq, 0, enc.encode(msg));
}
export function frameAck(seq: number, msg = ""): Uint8Array {
  return makeFrame(KIND.ACK, seq, 0, msg ? enc.encode(msg) : new Uint8Array(0));
}
export function frameProgress(seq: number, sent: number, total: number): Uint8Array {
  const p = new Uint8Array(8);
  const v = new DataView(p.buffer);
  v.setUint32(0, sent, false);
  v.setUint32(4, total, false);
  return makeFrame(KIND.PROGRESS, seq, 0, p);
}
export function frameData(seq: number, payload: Uint8Array): Uint8Array {
  return makeFrame(KIND.DATA, seq, 0, payload);
}
export function frameStdout(text: string): Uint8Array {
  return makeFrame(KIND.STDOUT, 0xFF, 0, enc.encode(text));
}
export function frameProgEnd(ok: boolean, msg = ""): Uint8Array {
  const msgBytes = enc.encode(msg);
  const p = new Uint8Array(1 + msgBytes.length);
  p[0] = ok ? 1 : 0;
  p.set(msgBytes, 1);
  return makeFrame(KIND.PROG_END, 0xFF, 0, p);
}
export function frameHello(): Uint8Array {
  return makeFrame(KIND.HELLO, 0xFF, 0, helloBoardPayload());
}

export function helloBoardPayload(): Uint8Array {
  const name = enc.encode(BOARD_NAME + "\0");
  const ver  = enc.encode(BOARD_VERSION + "\0");
  const fw   = enc.encode(FW_VERSION + "\0");
  const p = new Uint8Array(4 + name.length + ver.length + fw.length);
  new DataView(p.buffer).setUint32(0, PROTO_VER, false);
  p.set(name, 4);
  p.set(ver, 4 + name.length);
  p.set(fw, 4 + name.length + ver.length);
  return p;
}
