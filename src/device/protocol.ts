import type { Transport, Unsubscribe } from "../transport/types";

/**
 * Hub wire protocol V2. Binary framing.
 *
 * Frame: [0x7E][LEN:varint][SEQ:u8][FLAGS:u8][KIND:u8][PAYLOAD:LEN bytes]
 *
 * LEN  LEB128 LE, up to 5 bytes. Bit 7 = continuation.
 * SEQ  Host→Device: monotonic 0x00–0xFF. Device→Host: 0xFF = unsolicited.
 * FLAGS  bit 0 NO_ACK (no response expected, SEQ still valid for ordering).
 * KIND   see KIND constants below.
 *
 * Host → Device:
 *   0x01  HELLO_REQ  ()                        → OK with board-info payload
 *   0x10  PING       ()                        → OK
 *   0x11  MTU_REQ    ()                        → OK [mtu:u16 BE]
 *   0x12  RUN        path:utf8                 → OK; then PROG_END (unsolicited)
 *   0x13  STOP       ()                        → OK (FLAGS=NO_ACK: fire-and-forget)
 *   0x14  UPLOAD     [path_len:u8][path][data] → ACK → PROGRESS* → OK
 *   0x15  READ       path:utf8                 → DATA raw bytes
 *   0x16  LS         path:utf8                 → DATA [is_dir:u8][name\0]...
 *   0x17  MV         [src_len:u8][src][dst_len:u8][dst] → OK
 *   0x18  CP         [src_len:u8][src][dst_len:u8][dst] → OK
 *   0x19  RM         path:utf8                 → OK
 *
 * Device → Host:
 *   0x20  HELLO     [proto_ver:u8][board_name\0][board_ver\0]  SEQ=0xFF
 *   0x21  OK        payload (utf8 or structured, see cmd)
 *   0x22  ERR       error message utf8
 *   0x23  ACK       optional msg  (echoes SEQ, resets idle timer)
 *   0x24  PROGRESS  [sent:u32 BE][total:u32 BE]
 *   0x25  DATA      binary payload (echoes SEQ)
 *   0x30  STDOUT    utf8 text  SEQ=0xFF
 *   0x31  STDERR    utf8 text  SEQ=0xFF
 *   0x32  PROG_END  [ok:u8][message utf8]  SEQ=0xFF
 */

// ── Kind constants ────────────────────────────────────────────────────────────
export const KIND = {
  HELLO_REQ: 0x01,
  PING:      0x10,
  MTU_REQ:   0x11,
  RUN:       0x12,
  STOP:      0x13,
  UPLOAD:    0x14,
  READ:      0x15,
  LS:        0x16,
  MV:        0x17,
  CP:        0x18,
  RM:        0x19,
  HELLO:     0x20,
  OK:        0x21,
  ERR:       0x22,
  ACK:       0x23,
  PROGRESS:  0x24,
  DATA:      0x25,
  STDOUT:    0x30,
  STDERR:    0x31,
  PROG_END:  0x32,
} as const;

export const FLAGS_NO_ACK = 0x01;
export const SEQ_UNSOLICITED = 0xFF;

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

// ── Public types ──────────────────────────────────────────────────────────────

export type StdoutSink = (chunk: string) => void;
export type StderrSink = (chunk: string) => void;
export interface ProgramEndInfo { ok: boolean; message: string; }
export type ProgramEndSink = (info: ProgramEndInfo) => void;
export type ProgressSink = (sent: number, total: number) => void;

export interface HelloInfo {
  protocolVersion: number;
  boardName: string;
  boardVersion: string;
}
export type HelloSink = (info: HelloInfo) => void;

export interface FrameReply {
  kind: "OK" | "ERR" | "DATA";
  /** Raw payload bytes. Decode to text with TextDecoder if needed. */
  payload: Uint8Array;
}

export interface DirEntry { name: string; isDir: boolean; }

/** Protocol interface — all higher-level code depends on this, not the impl. */
export interface IHubProtocol {
  readonly protocolVersion: number;
  readonly boardName: string;
  readonly boardVersion: string;

  dispose(): void;
  setStdoutSink(sink: StdoutSink | null): void;
  setStderrSink(sink: StderrSink | null): void;
  setProgramEndSink(sink: ProgramEndSink | null): void;
  setHelloSink(sink: HelloSink | null): void;
  isProgramRunning(): boolean;

  requestHello(timeoutMs?: number): Promise<void>;
  ping(timeoutMs?: number): Promise<void>;
  mtu(timeoutMs?: number): Promise<number>;
  runProgram(path: string, timeoutMs?: number): Promise<void>;
  stop(noAck?: boolean, timeoutMs?: number): Promise<void>;
  upload(path: string, bytes: Uint8Array, idleTimeoutMs?: number, onProgress?: ProgressSink): Promise<void>;
  readFile(path: string, timeoutMs?: number): Promise<Uint8Array>;
  ls(path: string, timeoutMs?: number): Promise<DirEntry[]>;
  mv(src: string, dst: string, timeoutMs?: number): Promise<void>;
  cp(src: string, dst: string, timeoutMs?: number): Promise<void>;
  rm(path: string, timeoutMs?: number): Promise<void>;
}

// ── Parse state machine ───────────────────────────────────────────────────────

const Phase = { Idle: 0, Varint: 1, Fixed: 2, Payload: 3 } as const;
type Phase = typeof Phase[keyof typeof Phase];

interface ParseState {
  phase: Phase;
  // Varint accumulation
  varintAccum: number;
  varintShift: number;
  varintBytesRead: number;
  payloadLen: number;
  // Fixed header bytes [SEQ, FLAGS, KIND]
  fixedBuf: number[];
  // Payload accumulation
  seq: number;
  flags: number;
  kind: number;
  payloadBuf: Uint8Array | null;
  payloadFilled: number;
}

function freshState(): ParseState {
  return {
    phase: Phase.Idle,
    varintAccum: 0,
    varintShift: 0,
    varintBytesRead: 0,
    payloadLen: 0,
    fixedBuf: [],
    seq: 0,
    flags: 0,
    kind: 0,
    payloadBuf: null,
    payloadFilled: 0,
  };
}

// ── Waiter ────────────────────────────────────────────────────────────────────

interface Waiter {
  resolve: (reply: FrameReply) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  idleTimeoutMs: number;
  onProgress?: ProgressSink;
  requestKind: number;
}

interface SendOptions {
  timeoutMs: number;
  onProgress?: ProgressSink;
}

// ── HubProtocolV2 ─────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

export class HubProtocolV2 implements IHubProtocol {
  private transport: Transport;
  private unsub: Unsubscribe | null = null;
  private onStdout: StdoutSink | null = null;
  private onStderr: StderrSink | null = null;
  private onProgramEnd: ProgramEndSink | null = null;
  private onHello: HelloSink | null = null;
  private programRunning = false;
  private waiters = new Map<number, Waiter>();
  private state: ParseState = freshState();
  private sending = Promise.resolve();
  private _seq = 0;

  private _protocolVersion = 0;
  private _boardName = "";
  private _boardVersion = "";

  constructor(transport: Transport) {
    this.transport = transport;
    this.unsub = transport.onData((chunk) => this.onChunk(chunk));
  }

  get protocolVersion(): number { return this._protocolVersion; }
  get boardName(): string { return this._boardName; }
  get boardVersion(): string { return this._boardVersion; }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    for (const w of this.waiters.values()) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error("Disposed"));
    }
    this.waiters.clear();
    if (this.programRunning) {
      this.programRunning = false;
      this.onProgramEnd?.({ ok: false, message: "disconnected" });
    }
  }

  setStdoutSink(sink: StdoutSink | null): void    { this.onStdout = sink; }
  setStderrSink(sink: StderrSink | null): void    { this.onStderr = sink; }
  setProgramEndSink(sink: ProgramEndSink | null): void { this.onProgramEnd = sink; }
  setHelloSink(sink: HelloSink | null): void      { this.onHello = sink; }
  isProgramRunning(): boolean                     { return this.programRunning; }

  // ── Public commands ─────────────────────────────────────────────────────────

  async requestHello(timeoutMs = 2000): Promise<void> {
    const reply = await this.sendRequest(KIND.HELLO_REQ, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "HELLO_REQ failed");
    this.parseHelloPayload(reply.payload);
  }

  async ping(timeoutMs = 3000): Promise<void> {
    const reply = await this.sendRequest(KIND.PING, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error("PING failed");
  }

  async mtu(timeoutMs = 3000): Promise<number> {
    const reply = await this.sendRequest(KIND.MTU_REQ, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MTU failed");
    if (reply.payload.length < 2) throw new Error("MTU: bad reply");
    return new DataView(reply.payload.buffer, reply.payload.byteOffset).getUint16(0, false);
  }

  async runProgram(path: string, timeoutMs = 15000): Promise<void> {
    const reply = await this.sendRequest(KIND.RUN, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "RUN failed");
    // programRunning was set to true in dispatch() when OK arrived, before this resumes
  }

  async stop(noAck = false, timeoutMs = 3000): Promise<void> {
    if (noAck) {
      this.sendNoAck(KIND.STOP, new Uint8Array(0));
      return;
    }
    const reply = await this.sendRequest(KIND.STOP, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "STOP failed");
    if (this.programRunning) {
      this.programRunning = false;
      this.onProgramEnd?.({ ok: true, message: "stopped" });
    }
  }

  async upload(
    path: string,
    bytes: Uint8Array,
    idleTimeoutMs = 15000,
    onProgress?: ProgressSink,
  ): Promise<void> {
    const pathBytes = enc.encode(path);
    if (pathBytes.length > 255) throw new Error(`path too long: ${path}`);
    const payload = new Uint8Array(1 + pathBytes.length + bytes.length);
    payload[0] = pathBytes.length;
    payload.set(pathBytes, 1);
    payload.set(bytes, 1 + pathBytes.length);
    const reply = await this.sendRequest(KIND.UPLOAD, 0, payload, { timeoutMs: idleTimeoutMs, onProgress });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "UPLOAD failed");
  }

  async readFile(path: string, timeoutMs = 3000, onProgress?: ProgressSink): Promise<Uint8Array> {
    const reply = await this.sendRequest(KIND.READ, 0, enc.encode(path), { timeoutMs, onProgress });
    if (reply.kind === "ERR") throw new Error(dec.decode(reply.payload));
    if (reply.kind !== "DATA") throw new Error("READ: expected DATA reply");
    return reply.payload;
  }

  async ls(path: string, timeoutMs = 3000): Promise<DirEntry[]> {
    const reply = await this.sendRequest(KIND.LS, 0, enc.encode(path), { timeoutMs });
    if (reply.kind === "ERR") throw new Error(dec.decode(reply.payload));
    if (reply.kind !== "DATA") throw new Error("LS: expected DATA reply");
    return parseLsPayload(reply.payload);
  }

  async mv(src: string, dst: string, timeoutMs = 5000): Promise<void> {
    const reply = await this.sendRequest(KIND.MV, 0, encodeTwoPaths(src, dst), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MV failed");
  }

  async cp(src: string, dst: string, timeoutMs = 10000): Promise<void> {
    const reply = await this.sendRequest(KIND.CP, 0, encodeTwoPaths(src, dst), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "CP failed");
  }

  async rm(path: string, timeoutMs = 5000): Promise<void> {
    const reply = await this.sendRequest(KIND.RM, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "RM failed");
  }

  // ── Private send helpers ────────────────────────────────────────────────────

  private nextSeq(): number {
    const s = this._seq;
    this._seq = (this._seq + 1) & 0xFF;
    return s;
  }

  private sendRequest(
    kind: number,
    flags: number,
    payload: Uint8Array,
    opts: SendOptions,
  ): Promise<FrameReply> {
    const seq = this.nextSeq();
    const frame = makeFrame(kind, seq, flags, payload);
    const p = new Promise<FrameReply>((resolve, reject) => {
      const w: Waiter = {
        resolve,
        reject,
        idleTimeoutMs: opts.timeoutMs,
        onProgress: opts.onProgress,
        requestKind: kind,
      };
      w.timer = setTimeout(() => {
        this.waiters.delete(seq);
        console.warn(`[proto] TIMEOUT kind=0x${kind.toString(16).padStart(2,'0')} seq=${seq} after ${opts.timeoutMs}ms`);
        reject(new Error("protocol timeout"));
      }, opts.timeoutMs);
      this.waiters.set(seq, w);
    });
    this.sending = this.sending
      .then(() => {
        console.log(`[proto] → kind=0x${kind.toString(16).padStart(2,'0')} seq=${seq} ${payload.length}b`);
        return this.transport.write(frame);
      })
      .catch((e) => { console.error("[protocol] write failed", e); });
    return p;
  }

  private sendNoAck(kind: number, payload: Uint8Array): void {
    const seq = this.nextSeq();
    const frame = makeFrame(kind, seq, FLAGS_NO_ACK, payload);
    const write = (this.transport.writeFast?.bind(this.transport)
      ?? this.transport.write.bind(this.transport));
    this.sending = this.sending.then(() => write(frame)).catch(() => {});
  }

  private resolveWaiter(seq: number, reply: FrameReply): void {
    const w = this.waiters.get(seq);
    if (!w) return;
    this.waiters.delete(seq);
    if (w.timer) clearTimeout(w.timer);
    w.resolve(reply);
  }

  private resetWaiterTimer(seq: number): void {
    const w = this.waiters.get(seq);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      this.waiters.delete(seq);
      w.reject(new Error("protocol timeout"));
    }, w.idleTimeoutMs);
  }

  // ── Frame dispatch ──────────────────────────────────────────────────────────

  private dispatch(seq: number, _flags: number, kind: number, payload: Uint8Array): void {
    switch (kind) {
      case KIND.HELLO:
        this.parseHelloPayload(payload);
        break;

      case KIND.OK: {
        console.log(`[proto] ← OK seq=${seq} ${payload.length}b`);
        const w = this.waiters.get(seq);
        if (w?.requestKind === KIND.RUN) this.programRunning = true;
        this.resolveWaiter(seq, { kind: "OK", payload });
        break;
      }

      case KIND.ERR:
        console.log(`[proto] ← ERR seq=${seq}`);
        if (this.programRunning && !this.waiters.has(seq)) {
          // Unsolicited ERR during program = legacy traceback fallback
          this.programRunning = false;
          this.onProgramEnd?.({ ok: false, message: dec.decode(payload) });
        } else {
          this.resolveWaiter(seq, { kind: "ERR", payload });
        }
        break;

      case KIND.ACK:
        console.log(`[proto] ← ACK seq=${seq}`);
        this.resetWaiterTimer(seq);
        break;

      case KIND.PROGRESS: {
        this.resetWaiterTimer(seq);
        const w = this.waiters.get(seq);
        if (w?.onProgress && payload.length >= 8) {
          const dv = new DataView(payload.buffer, payload.byteOffset);
          try {
            w.onProgress(dv.getUint32(0, false), dv.getUint32(4, false));
          } catch (e) {
            this.waiters.delete(seq);
            if (w.timer) clearTimeout(w.timer);
            w.reject(e instanceof Error ? e : new Error(String(e)));
          }
        }
        break;
      }

      case KIND.DATA:
        this.resolveWaiter(seq, { kind: "DATA", payload });
        break;

      case KIND.STDOUT:
        this.onStdout?.(dec.decode(payload));
        break;

      case KIND.STDERR:
        this.onStderr?.(dec.decode(payload));
        break;

      case KIND.PROG_END:
        if (this.programRunning) {
          this.programRunning = false;
          const ok = payload.length > 0 && payload[0] !== 0;
          const message = payload.length > 1 ? dec.decode(payload.slice(1)) : "";
          this.onProgramEnd?.({ ok, message });
        }
        break;

      default:
        break;
    }
  }

  private parseHelloPayload(payload: Uint8Array): void {
    if (payload.length < 1) return;
    const protoVer = payload[0];
    let i = 1;
    // null-terminated board name
    let j = i;
    while (j < payload.length && payload[j] !== 0) j++;
    const boardName = dec.decode(payload.slice(i, j));
    i = j + 1;
    // null-terminated board version
    j = i;
    while (j < payload.length && payload[j] !== 0) j++;
    const boardVersion = dec.decode(payload.slice(i, j));
    this._protocolVersion = protoVer;
    this._boardName = boardName;
    this._boardVersion = boardVersion;
    this.onHello?.({ protocolVersion: protoVer, boardName, boardVersion });
  }

  // ── Binary stream parser ────────────────────────────────────────────────────

  private onChunk(chunk: Uint8Array): void {
    console.log(`[proto] ← raw ${chunk.length}b hex=${Array.from(chunk.slice(0,16)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}${chunk.length>16?'…':''}`);
    for (const seq of this.waiters.keys()) {
      this.resetWaiterTimer(seq);
    }
    let i = 0;
    while (i < chunk.length) {
      switch (this.state.phase) {
        case Phase.Idle: {
          // Scan for MAGIC 0x7E
          while (i < chunk.length && chunk[i] !== 0x7E) i++;
          if (i < chunk.length) {
            i++; // consume 0x7E
            this.state.phase = Phase.Varint;
            this.state.varintAccum = 0;
            this.state.varintShift = 0;
            this.state.varintBytesRead = 0;
          }
          break;
        }
        case Phase.Varint: {
          while (i < chunk.length) {
            const b = chunk[i++];
            this.state.varintAccum |= (b & 0x7F) << this.state.varintShift;
            this.state.varintShift += 7;
            this.state.varintBytesRead++;
            if (!(b & 0x80) || this.state.varintBytesRead === 5) {
              this.state.payloadLen = this.state.varintAccum;
              this.state.phase = Phase.Fixed;
              this.state.fixedBuf = [];
              break;
            }
          }
          break;
        }
        case Phase.Fixed: {
          while (i < chunk.length && this.state.fixedBuf.length < 3) {
            this.state.fixedBuf.push(chunk[i++]);
          }
          if (this.state.fixedBuf.length === 3) {
            this.state.seq   = this.state.fixedBuf[0];
            this.state.flags = this.state.fixedBuf[1];
            this.state.kind  = this.state.fixedBuf[2];
            if (this.state.payloadLen > 0) {
              this.state.payloadBuf = new Uint8Array(this.state.payloadLen);
              this.state.payloadFilled = 0;
              this.state.phase = Phase.Payload;
            } else {
              this.dispatch(this.state.seq, this.state.flags, this.state.kind, new Uint8Array(0));
              this.state = freshState();
            }
          }
          break;
        }
        case Phase.Payload: {
          // Bulk copy from chunk
          const buf = this.state.payloadBuf!;
          const need = this.state.payloadLen - this.state.payloadFilled;
          const take = Math.min(need, chunk.length - i);
          buf.set(chunk.subarray(i, i + take), this.state.payloadFilled);
          this.state.payloadFilled += take;
          i += take;
          if (this.state.kind === KIND.DATA) {
            const w = this.waiters.get(this.state.seq);
            if (w?.onProgress) {
              try {
                w.onProgress(this.state.payloadFilled, this.state.payloadLen);
              } catch (e) {
                const seq = this.state.seq;
                this.state = freshState();
                this.waiters.delete(seq);
                if (w.timer) clearTimeout(w.timer);
                w.reject(e instanceof Error ? e : new Error(String(e)));
                break;
              }
            }
          }
          if (this.state.payloadFilled === this.state.payloadLen) {
            this.dispatch(this.state.seq, this.state.flags, this.state.kind, buf);
            this.state = freshState();
          }
          break;
        }
      }
    }
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function encodeTwoPaths(src: string, dst: string): Uint8Array {
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

function parseLsPayload(payload: Uint8Array): DirEntry[] {
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

// ── Path validation (unchanged) ───────────────────────────────────────────────

const FORBIDDEN = new Set(["/main.py", "/boot.py", "/boot.mpy", "/runner.py"]);

export class UploadError extends Error {}

export interface UploadPolicy { allowRoot: boolean; }

export function validatePath(path: string, policy: UploadPolicy): void {
  if (FORBIDDEN.has(path)) throw new UploadError(`Forbidden path: ${path}`);
  if (path.startsWith("/sd/")) return;
  if (policy.allowRoot && path.startsWith("/") && !path.startsWith("//")) return;
  throw new UploadError(`Path must be under /sd/ (allowRoot=${policy.allowRoot}): ${path}`);
}

// Back-compat alias so DeviceClient import doesn't need changing.
export { HubProtocolV2 as HubProtocol };
