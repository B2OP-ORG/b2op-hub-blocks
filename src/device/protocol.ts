import type { Transport, Unsubscribe } from "../transport/types";

/**
 * Hub wire protocol v2.0.0 (proto_ver byte = 3). Binary framing.
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
 *   0x14  UPLOAD     [path_len:u8][path bytes][file_size:u32 BE] → ACK; host sends DATA chunks → PROGRESS* → OK
 *   0x15  READ       path:utf8                 → ACK [size:u32 BE]; DATA chunks; OK
 *   0x16  LS         path:utf8                 → DATA [is_dir:u8][name\0]...
 *   0x17  MV         [src_len:u8][src][dst_len:u8][dst] → OK
 *   0x18  CP         [src_len:u8][src][dst_len:u8][dst] → ACK; OK (runs in background)
 *   0x19  RM         path:utf8                 → OK
 *   0x1A  MKDIR      path:utf8                 → OK  (mkdir -p; OK if already a dir)
 *   0x1B  ABORT      [target_seq:u8] or ()     → OK; cancelled stream gets ERR "aborted" on its own SEQ
 *                    Host MUST send ABORT whenever it gives up on a stream locally
 *                    (cancel, timeout, bad chunk, disconnect) or the device keeps streaming.
 *   0x25  DATA       [offset:u32 BE][bytes]    UPLOAD chunks (SEQ = the UPLOAD's SEQ)
 *
 * Device → Host:
 *   0x20  HELLO      [proto_ver:u8][board_name\0][board_ver\0][fw_ver\0]  SEQ=0xFF
 *   0x21  OK         payload (utf8 or structured, see cmd)
 *   0x22  ERR        error message utf8
 *   0x23  ACK        optional msg  (echoes SEQ, resets idle timer)
 *   0x24  PROGRESS   [sent:u32 BE][total:u32 BE]
 *   0x25  DATA       binary payload (echoes SEQ); READ chunks are [offset:u32 BE][bytes]
 *   0x30  STDOUT     utf8 text  SEQ=0xFF
 *   0x31  STDERR     utf8 text  SEQ=0xFF
 *   0x32  PROG_END   [ok:u8][message utf8]  SEQ=0xFF
 *   0x33  PROG_START path:utf8              SEQ=0xFF; menu-initiated run started, or hub already running on BLE connect
 */

// ── Kind constants ────────────────────────────────────────────────────────────
export const KIND = {
  HELLO_REQ:  0x01,
  PING:       0x10,
  MTU_REQ:    0x11,
  RUN:        0x12,
  STOP:       0x13,
  UPLOAD:     0x14,
  READ:       0x15,
  LS:         0x16,
  MV:         0x17,
  CP:         0x18,
  RM:         0x19,
  MKDIR:      0x1A,
  ABORT:      0x1B,
  HELLO:      0x20,
  OK:         0x21,
  ERR:        0x22,
  ACK:        0x23,
  PROGRESS:   0x24,
  DATA:       0x25,
  STDOUT:     0x30,
  STDERR:     0x31,
  PROG_END:   0x32,
  PROG_START: 0x33,
  EXEC:       0x34,
  CMD:        0x35,
} as const;

export const FLAGS_NO_ACK = 0x01;
export const SEQ_UNSOLICITED = 0xFF;

/** File bytes per UPLOAD DATA chunk (whole frame must fit the device's 2 KiB frame buffer). */
export const UPLOAD_CHUNK = 1024;
/** Max UPLOAD bytes in flight past the device's last PROGRESS (it reports every 4 KiB). */
export const UPLOAD_WINDOW = 8192;

/**
 * Maps the proto_ver byte (sent in HELLO) to a semver name.
 * Add an entry here when a new incompatible protocol variant is introduced.
 */
export const PROTOCOL_REGISTRY = new Map<number, string>([
  [3, "2.0.0"],
]);

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
export interface ProgramStartInfo { path: string; }
export type ProgramStartSink = (info: ProgramStartInfo) => void;
export type ProgressSink = (sent: number, total: number) => void;

export interface HelloInfo {
  protocolVersion: number;
  boardName: string;
  boardVersion: string;
  fwVersion: string;
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
  readonly fwVersion: string;

  dispose(): void;
  setStdoutSink(sink: StdoutSink | null): void;
  setStderrSink(sink: StderrSink | null): void;
  setProgramEndSink(sink: ProgramEndSink | null): void;
  setProgramStartSink(sink: ProgramStartSink | null): void;
  setHelloSink(sink: HelloSink | null): void;
  /** Add an extra stdout sink; returns unsubscribe function. Multiple sinks allowed. */
  addStdoutSink(sink: StdoutSink): () => void;
  /** Add an extra stderr sink; returns unsubscribe function. Multiple sinks allowed. */
  addStderrSink(sink: StderrSink): () => void;
  isProgramRunning(): boolean;
  /** True while an UPLOAD / READ / CP waiter is pending. */
  hasActiveStreams(): boolean;

  requestHello(timeoutMs?: number): Promise<void>;
  ping(timeoutMs?: number): Promise<void>;
  mtu(timeoutMs?: number): Promise<number>;
  runProgram(path: string, timeoutMs?: number): Promise<void>;
  stop(noAck?: boolean, timeoutMs?: number): Promise<void>;
  upload(path: string, bytes: Uint8Array, idleTimeoutMs?: number, onProgress?: ProgressSink): Promise<void>;
  readFile(path: string, timeoutMs?: number, onProgress?: ProgressSink): Promise<Uint8Array>;
  ls(path: string, timeoutMs?: number): Promise<DirEntry[]>;
  mv(src: string, dst: string, timeoutMs?: number): Promise<void>;
  cp(src: string, dst: string, timeoutMs?: number): Promise<void>;
  rm(path: string, timeoutMs?: number): Promise<void>;
  mkdir(path: string, timeoutMs?: number): Promise<void>;
  /** Cancel the UPLOAD / READ / CP started with `targetSeq` (omit = all streams). */
  abort(targetSeq?: number, timeoutMs?: number): Promise<void>;
  /** Execute Python source in REPL mode on device. STDOUT arrives via stdout sinks. */
  exec(code: string, timeoutMs?: number): Promise<FrameReply>;
  /** Send a binary CMD frame. Reply is KIND_OK or KIND_DATA. */
  cmd(payload: Uint8Array, timeoutMs?: number): Promise<FrameReply>;
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
  onAck?: (payload: Uint8Array) => void;
  /** Streamed DATA handler; when set, DATA frames don't settle the waiter. */
  onData?: (payload: Uint8Array) => void;
}

/** Kinds whose transfer is a device-side stream that ABORT can cancel. */
const STREAM_KINDS = new Set<number>([KIND.UPLOAD, KIND.READ, KIND.CP]);

interface SendOptions {
  timeoutMs: number;
  onProgress?: ProgressSink;
  onAck?: (payload: Uint8Array) => void;
  onData?: (payload: Uint8Array) => void;
  /** Use writeValueWithoutResponse for large host→device transfers (e.g. UPLOAD). */
  fast?: boolean;
}

// ── HubProtocolV2_0_0 ────────────────────────────────────────────────────────
// Wire protocol semver v2.0.0 (proto_ver byte = 3).

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

export class HubProtocolV2_0_0 implements IHubProtocol {
  private transport: Transport;
  private unsub: Unsubscribe | null = null;
  private onStdout: StdoutSink | null = null;
  private extraStdoutSinks = new Set<StdoutSink>();
  private onStderr: StderrSink | null = null;
  private extraStderrSinks = new Set<StderrSink>();
  private onProgramEnd: ProgramEndSink | null = null;
  private onProgramStart: ProgramStartSink | null = null;
  private onHello: HelloSink | null = null;
  private programRunning = false;
  private waiters = new Map<number, Waiter>();
  private state: ParseState = freshState();
  private sending = Promise.resolve();
  private _seq = 0;

  private _protocolVersion = 0;
  private _boardName = "";
  private _boardVersion = "";
  private _fwVersion = "";

  constructor(transport: Transport) {
    this.transport = transport;
    this.unsub = transport.onData((chunk) => this.onChunk(chunk));
  }

  get protocolVersion(): number { return this._protocolVersion; }
  get boardName(): string { return this._boardName; }
  get boardVersion(): string { return this._boardVersion; }
  get fwVersion(): string { return this._fwVersion; }

  hasActiveStreams(): boolean {
    for (const w of this.waiters.values()) if (STREAM_KINDS.has(w.requestKind)) return true;
    return false;
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    for (const w of this.waiters.values()) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error("Disposed"));
    }
    this.waiters.clear();
    this.extraStdoutSinks.clear();
    this.extraStderrSinks.clear();
    if (this.programRunning) {
      this.programRunning = false;
      this.onProgramEnd?.({ ok: false, message: "disconnected" });
    }
  }

  setStdoutSink(sink: StdoutSink | null): void    { this.onStdout = sink; }
  setStderrSink(sink: StderrSink | null): void    { this.onStderr = sink; }
  setProgramEndSink(sink: ProgramEndSink | null): void   { this.onProgramEnd = sink; }
  setProgramStartSink(sink: ProgramStartSink | null): void { this.onProgramStart = sink; }
  setHelloSink(sink: HelloSink | null): void             { this.onHello = sink; }
  addStdoutSink(sink: StdoutSink): () => void {
    this.extraStdoutSinks.add(sink);
    return () => this.extraStdoutSinks.delete(sink);
  }
  addStderrSink(sink: StderrSink): () => void {
    this.extraStderrSinks.add(sink);
    return () => this.extraStderrSinks.delete(sink);
  }
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

  async runProgram(path: string, timeoutMs = 3000): Promise<void> {
    const reply = await this.sendRequest(KIND.RUN, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "RUN failed");
    // programRunning was set to true in dispatch() when OK arrived, before this resumes
  }

  async stop(noAck = false, timeoutMs = 3000): Promise<void> {
    this.state = freshState();
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

    // UPLOAD frame payload: [path_len:u8][path bytes][file_size:u32 BE]
    const payload = new Uint8Array(1 + pathBytes.length + 4);
    payload[0] = pathBytes.length;
    payload.set(pathBytes, 1);
    new DataView(payload.buffer).setUint32(1 + pathBytes.length, bytes.length, false);

    const seq = this.nextSeq();
    // Contiguous bytes the device has confirmed via PROGRESS (flow-control window base).
    let confirmed = 0;
    let settled = false;
    let wake: (() => void) | null = null;
    const wakeUp = () => { const f = wake; wake = null; f?.(); };

    const pump = async (w: Waiter) => {
      const alive = () => !settled && this.waiters.get(seq) === w;
      for (let off = 0; off < bytes.length; off += UPLOAD_CHUNK) {
        while (off - confirmed >= UPLOAD_WINDOW) {
          if (!alive()) return;
          await new Promise<void>((r) => { wake = r; });
        }
        if (!alive()) return;
        const end = Math.min(off + UPLOAD_CHUNK, bytes.length);
        const chunk = new Uint8Array(4 + end - off);
        new DataView(chunk.buffer).setUint32(0, off, false);
        chunk.set(bytes.subarray(off, end), 4);
        const frame = makeFrame(KIND.DATA, seq, 0, chunk);
        const wp = this.sending.then(() => this.transport.write(frame));
        this.sending = wp.catch(() => {});
        try {
          await wp;
        } catch (e) {
          if (alive()) this.failWaiter(seq, w, e instanceof Error ? e : new Error(String(e)));
          return;
        }
      }
    };

    const p = new Promise<FrameReply>((resolve, reject) => {
      const w: Waiter = {
        resolve,
        reject,
        idleTimeoutMs,
        requestKind: KIND.UPLOAD,
        onProgress: (sent, total) => {
          confirmed = Math.max(confirmed, sent);
          wakeUp();
          onProgress?.(sent, total);
        },
        onAck: () => { void pump(w); },
      };
      w.timer = setTimeout(() => {
        this.waiters.delete(seq);
        console.warn(`[proto] TIMEOUT UPLOAD seq=${seq}`);
        this.sendAbort(seq);
        reject(new Error("protocol timeout"));
      }, idleTimeoutMs);
      this.waiters.set(seq, w);
    });
    void p.finally(() => { settled = true; wakeUp(); }).catch(() => {});

    this.sending = this.sending
      .then(() => {
        console.log(`[proto] → UPLOAD seq=${seq} path=${path} size=${bytes.length}`);
        return this.transport.write(makeFrame(KIND.UPLOAD, seq, 0, payload));
      })
      .catch((e) => { console.error("[protocol] write failed", e); });

    const reply = await p;
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "UPLOAD failed");
  }

  async readFile(path: string, timeoutMs = 3000, onProgress?: ProgressSink): Promise<Uint8Array> {
    let buf: Uint8Array | null = null;
    let received = 0;
    // Chunks may repeat; count each offset once so `received` reflects unique bytes.
    const seen = new Set<number>();
    const reply = await this.sendRequest(KIND.READ, 0, enc.encode(path), {
      timeoutMs,
      onAck: (payload) => {
        if (payload.length < 4) throw new Error("READ: bad ACK");
        const size = new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false);
        buf = new Uint8Array(size);
        onProgress?.(0, size);
      },
      onData: (payload) => {
        if (!buf) throw new Error("READ: DATA before ACK");
        if (payload.length < 4) return;
        const off = new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false);
        const data = payload.subarray(4);
        if (off + data.length > buf.length) throw new Error("READ: chunk past end of file");
        buf.set(data, off);
        if (seen.has(off)) return;
        seen.add(off);
        received += data.length;
        onProgress?.(Math.min(received, buf.length), buf.length);
      },
    });
    if (reply.kind === "ERR") throw new Error(dec.decode(reply.payload));
    if (reply.kind !== "OK") throw new Error("READ: expected OK reply");
    const out = buf as Uint8Array | null;
    if (!out) throw new Error("READ: missing ACK");
    if (received < out.length) throw new Error(`READ: got ${received} of ${out.length} bytes`);
    return out;
  }

  async ls(path: string, timeoutMs = 3000): Promise<DirEntry[]> {
    const reply = await this.sendRequest(KIND.LS, 0, enc.encode(path), { timeoutMs });
    if (reply.kind === "ERR") throw new Error(dec.decode(reply.payload));
    if (reply.kind !== "DATA") throw new Error("LS: expected DATA reply");
    return parseLsPayload(reply.payload);
  }

  async mv(src: string, dst: string, timeoutMs = 3000): Promise<void> {
    const reply = await this.sendRequest(KIND.MV, 0, encodeTwoPaths(src, dst), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MV failed");
  }

  async cp(src: string, dst: string, timeoutMs = 15000): Promise<void> {
    const reply = await this.sendRequest(KIND.CP, 0, encodeTwoPaths(src, dst), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "CP failed");
  }

  async rm(path: string, timeoutMs = 3000): Promise<void> {
    const reply = await this.sendRequest(KIND.RM, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "RM failed");
  }

  async mkdir(path: string, timeoutMs = 3000): Promise<void> {
    const reply = await this.sendRequest(KIND.MKDIR, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MKDIR failed");
  }

  async abort(targetSeq?: number, timeoutMs = 3000): Promise<void> {
    const payload = targetSeq === undefined ? new Uint8Array(0) : Uint8Array.of(targetSeq & 0xFF);
    const reply = await this.sendRequest(KIND.ABORT, 0, payload, { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "ABORT failed");
  }

  async exec(code: string, timeoutMs = 10000): Promise<FrameReply> {
    return this.sendRequest(KIND.EXEC, 0, enc.encode(code), { timeoutMs });
  }

  async cmd(payload: Uint8Array, timeoutMs = 5000): Promise<FrameReply> {
    return this.sendRequest(KIND.CMD, 0, payload, { timeoutMs });
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
        onAck: opts.onAck,
        onData: opts.onData,
        requestKind: kind,
      };
      w.timer = setTimeout(() => {
        this.waiters.delete(seq);
        if (STREAM_KINDS.has(kind)) this.sendAbort(seq);
        console.warn(`[proto] TIMEOUT kind=0x${kind.toString(16).padStart(2,'0')} seq=${seq} after ${opts.timeoutMs}ms`);
        reject(new Error("protocol timeout"));
      }, opts.timeoutMs);
      this.waiters.set(seq, w);
    });
    this.sending = this.sending
      .then(() => {
        console.log(`[proto] → kind=0x${kind.toString(16).padStart(2,'0')} seq=${seq} ${payload.length}b`);
        const write = opts.fast && this.transport.writeFast
          ? this.transport.writeFast.bind(this.transport)
          : this.transport.write.bind(this.transport);
        return write(frame);
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

  /** Fire-and-forget ABORT for a stream we gave up on (its ERR "aborted" is dropped). */
  private sendAbort(targetSeq: number): void {
    const frame = makeFrame(KIND.ABORT, this.nextSeq(), 0, Uint8Array.of(targetSeq & 0xFF));
    this.sending = this.sending.then(() => this.transport.write(frame)).catch(() => {});
  }

  /** Reject a waiter locally (e.g. user cancel from a progress callback); aborts its device stream. */
  private failWaiter(seq: number, w: Waiter, err: Error): void {
    if (this.waiters.get(seq) !== w) return;
    this.waiters.delete(seq);
    if (w.timer) clearTimeout(w.timer);
    if (STREAM_KINDS.has(w.requestKind)) this.sendAbort(seq);
    w.reject(err);
  }

  /** Run a waiter callback; a throw cancels the request. Returns false if it threw. */
  private guard(seq: number, w: Waiter, fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (e) {
      this.failWaiter(seq, w, e instanceof Error ? e : new Error(String(e)));
      return false;
    }
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
      if (STREAM_KINDS.has(w.requestKind)) this.sendAbort(seq);
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
        if (seq === SEQ_UNSOLICITED && this.programRunning) {
          // Unsolicited ERR during program = legacy traceback fallback
          this.programRunning = false;
          this.onProgramEnd?.({ ok: false, message: dec.decode(payload) });
        } else {
          this.resolveWaiter(seq, { kind: "ERR", payload });
        }
        break;

      case KIND.ACK: {
        console.log(`[proto] ← ACK seq=${seq}`);
        this.resetWaiterTimer(seq);
        const w = this.waiters.get(seq);
        if (w?.onAck) this.guard(seq, w, () => w.onAck!(payload));
        break;
      }

      case KIND.PROGRESS: {
        this.resetWaiterTimer(seq);
        const w = this.waiters.get(seq);
        if (w?.onProgress && payload.length >= 8) {
          const dv = new DataView(payload.buffer, payload.byteOffset);
          this.guard(seq, w, () => w.onProgress!(dv.getUint32(0, false), dv.getUint32(4, false)));
        }
        break;
      }

      case KIND.DATA: {
        const w = this.waiters.get(seq);
        if (w?.onData) {
          this.resetWaiterTimer(seq);
          this.guard(seq, w, () => w.onData!(payload));
        } else {
          // No waiter: late chunk of an aborted / finished stream — dropped.
          this.resolveWaiter(seq, { kind: "DATA", payload });
        }
        break;
      }

      case KIND.STDOUT: {
        const text = dec.decode(payload);
        this.onStdout?.(text);
        for (const s of this.extraStdoutSinks) s(text);
        break;
      }

      case KIND.STDERR: {
        const errText = dec.decode(payload);
        this.onStderr?.(errText);
        for (const s of this.extraStderrSinks) s(errText);
        break;
      }

      case KIND.PROG_END:
        if (this.programRunning) {
          this.programRunning = false;
          const ok = payload.length > 0 && payload[0] !== 0;
          const message = payload.length > 1 ? dec.decode(payload.slice(1)) : "";
          this.onProgramEnd?.({ ok, message });
        }
        break;

      case KIND.PROG_START: {
        this.programRunning = true;
        const path = dec.decode(payload);
        this.onProgramStart?.({ path });
        break;
      }

      default:
        break;
    }
  }

  private parseHelloPayload(payload: Uint8Array): void {
    if (payload.length < 1) return;
    const protoVer = payload[0];
    const readStr = (start: number): [string, number] => {
      let j = start;
      while (j < payload.length && payload[j] !== 0) j++;
      return [dec.decode(payload.slice(start, j)), j + 1];
    };
    const [boardName, i1] = readStr(1);
    const [boardVersion, i2] = readStr(i1);
    const [fwVersion]        = readStr(i2);
    this._protocolVersion = protoVer;
    this._boardName = boardName;
    this._boardVersion = boardVersion;
    this._fwVersion = fwVersion;
    this.onHello?.({ protocolVersion: protoVer, boardName, boardVersion, fwVersion });
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

export { HubProtocolV2_0_0 as HubProtocol };
