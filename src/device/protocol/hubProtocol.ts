import { type FlagName, type ProtoFeatures, protoFeatures } from "../protocolFeatures";
import type { Transport, Unsubscribe } from "../transport/types";
import { DATA_FRAME_OVERHEAD, FLAGS_ECHO, FLAGS_ECHO_RX, FLAGS_NO_ACK, KIND, MIN_FAST_UPLOAD_CHUNK, SEQ_UNSOLICITED, UPLOAD_CHUNK, UPLOAD_WINDOW } from "./constants";
import { dec, enc, makeFrame } from "./framing";
import { FrameParser } from "./frameParser";
import { encodeTwoPaths, parseLsPayload } from "./payloads";
import { REMOTE_OP, type RemoteDef, type RemoteEvent, type RemoteSetEntry, type RemoteSink, RemoteType, checkRemoteId, decodeRemote, encodeRemoteDef, encodeRemoteSet, packRemote } from "./remote";
import { CancelledError, DEFAULT_TIMEOUT_MS, type DirEntry, type EchoSink, type FrameReply, type HelloSink, type IHubProtocol, type ProgramEndSink, type ProgramStartSink, type ProgressSink, type StderrSink, type StdoutSink } from "./types";
import { CMD_NAMES, KIND_NAMES, UnsupportedFeatureError } from "./version";

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
  /** Caller aborted; ABORT sent, waiting for the device to end the stream. */
  cancelling?: boolean;
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
  /** Abort a stream request (READ / CP); see cancelStream(). */
  signal?: AbortSignal;
}

// ── HubProtocolV1 ────────────────────────────────────────────────────────────
// Wire protocol v1.x (proto_ver major 1).


export class HubProtocolV1 implements IHubProtocol {
  private transport: Transport;
  private unsub: Unsubscribe | null = null;
  private onStdout: StdoutSink | null = null;
  private extraStdoutSinks = new Set<StdoutSink>();
  private onStderr: StderrSink | null = null;
  private extraStderrSinks = new Set<StderrSink>();
  private onProgramEnd: ProgramEndSink | null = null;
  private onProgramStart: ProgramStartSink | null = null;
  private onHello: HelloSink | null = null;
  private onEcho: EchoSink | null = null;
  private onRemote: RemoteSink | null = null;
  /** Program message id → type, from device DEFINEs (needed to decode SET). */
  private remoteMsgTypes = new Map<number, RemoteType>();
  private programRunning = false;
  private waiters = new Map<number, Waiter>();
  private parser = new FrameParser((seq, flags, kind, payload) => this.dispatch(seq, flags, kind, payload));
  private sending = Promise.resolve();
  private _seq = 0;
  /** Last queued stream (UPLOAD / READ / CP); see oneAtATime(). */
  private streamTail: Promise<void> | null = null;
  private disposed = false;

  private _protocolVersion = 0;
  private _boardName = "";
  private _boardVersion = "";
  private _fwVersion = "";
  /** Null until HELLO is parsed; until then every request is allowed (handshake). */
  private _features: ProtoFeatures | null = null;

  constructor(transport: Transport) {
    this.transport = transport;
    this.unsub = transport.onData((chunk) => this.onChunk(chunk));
  }

  get protocolVersion(): number { return this._protocolVersion; }
  get boardName(): string { return this._boardName; }
  get boardVersion(): string { return this._boardVersion; }
  get fwVersion(): string { return this._fwVersion; }
  get features(): ProtoFeatures | null { return this._features; }

  /** Null when `kind` may be sent, else the error to fail the request with. */
  private kindBlocked(kind: number): UnsupportedFeatureError | null {
    const name = KIND_NAMES.get(kind);
    if (!this._features || !name || this._features.kinds[name]) return null;
    return new UnsupportedFeatureError(name, this._protocolVersion);
  }

  /** Capability flags are off until HELLO is parsed (unlike kinds / cmds). */
  private hasFlag(flag: FlagName): boolean {
    return this._features?.flags[flag] ?? false;
  }

  private assertKind(kind: number): void {
    const err = this.kindBlocked(kind);
    if (err) throw err;
  }

  hasActiveStreams(): boolean {
    for (const w of this.waiters.values()) if (STREAM_KINDS.has(w.requestKind)) return true;
    return false;
  }

  dispose(): void {
    this.disposed = true;
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
  setEchoSink(sink: EchoSink | null): void               { this.onEcho = sink; }
  setRemoteSink(sink: RemoteSink | null): void           { this.onRemote = sink; }
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

  async requestHello(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    // The device resends every program message (DEFINE + SET) after its reply,
    // so start from nothing: messages that ended while we weren't listening go.
    this.emitRemote({ op: "clear", ids: [] });
    const reply = await this.sendRequest(KIND.HELLO_REQ, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "HELLO_REQ failed");
    this.parseHelloPayload(reply.payload);
  }

  async ping(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const reply = await this.sendRequest(KIND.PING, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error("PING failed");
  }

  async mtu(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
    const reply = await this.sendRequest(KIND.MTU_REQ, 0, new Uint8Array(0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MTU failed");
    if (reply.payload.length < 2) throw new Error("MTU: bad reply");
    return new DataView(reply.payload.buffer, reply.payload.byteOffset).getUint16(0, false);
  }

  async runProgram(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const reply = await this.sendRequest(KIND.RUN, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "RUN failed");
    // programRunning was set to true in dispatch() when OK arrived, before this resumes
  }

  async stop(noAck = false, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    this.parser.reset();
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

  upload(
    path: string,
    bytes: Uint8Array,
    idleTimeoutMs = DEFAULT_TIMEOUT_MS,
    onProgress?: ProgressSink,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.oneAtATime(signal, () => this.doUpload(path, bytes, idleTimeoutMs, onProgress, signal));
  }

  private async doUpload(
    path: string,
    bytes: Uint8Array,
    idleTimeoutMs: number,
    onProgress?: ProgressSink,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertKind(KIND.UPLOAD);
    this.assertKind(KIND.DATA);
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
      const alive = () => !settled && !w.cancelling && this.waiters.get(seq) === w;
      const { chunkSize, write } = this.uploadChunking();
      for (let off = 0; off < bytes.length; off += chunkSize) {
        while (off - confirmed >= UPLOAD_WINDOW) {
          if (!alive()) return;
          await new Promise<void>((r) => { wake = r; });
        }
        if (!alive()) return;
        const end = Math.min(off + chunkSize, bytes.length);
        const chunk = new Uint8Array(4 + end - off);
        new DataView(chunk.buffer).setUint32(0, off, false);
        chunk.set(bytes.subarray(off, end), 4);
        const frame = makeFrame(KIND.DATA, seq, 0, chunk);
        const wp = this.sending.then(() => write(frame));
        this.sending = wp.catch(() => {});
        try {
          await wp;
        } catch (e) {
          if (alive()) this.failWaiter(seq, w, e instanceof Error ? e : new Error(String(e)));
          return;
        }
      }
    };

    let unwatch = () => {};
    const p = new Promise<FrameReply>((resolve, reject) => {
      const w: Waiter = {
        resolve: (r) => (w.cancelling ? reject(new CancelledError()) : resolve(r)),
        reject: (e) => reject(w.cancelling ? new CancelledError() : e),
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
        w.reject(new Error("protocol timeout"));
      }, idleTimeoutMs);
      this.waiters.set(seq, w);
      unwatch = this.watchCancel(seq, signal, wakeUp);
    });
    void p.finally(() => { settled = true; unwatch(); wakeUp(); }).catch(() => {});

    this.sending = this.sending
      .then(() => {
        console.debug(`[proto] → UPLOAD seq=${seq} path=${path} size=${bytes.length}`);
        return this.transport.write(makeFrame(KIND.UPLOAD, seq, 0, payload));
      })
      .catch((e) => { console.error("[protocol] write failed", e); });

    const reply = await p;
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "UPLOAD failed");
  }

  /**
   * UPLOAD DATA chunking. Fast path: each DATA frame goes out as ONE writeFast
   * call (BLE writeValueWithoutResponse, frame ≤ ATT MTU − 3), so many frames
   * fit in a connection interval instead of one acknowledged ~MTU write each.
   * A frame split over several without-response writes can be reordered by
   * BlueZ and arrive scrambled; whole frames reordered or duplicated are fine
   * (DATA offsets + the hub's reorder window). Needs the FAST_UPLOAD feature
   * flag (off until HELLO) and a known MTU; otherwise 1 KiB chunks over
   * acknowledged `write`.
   */
  private uploadChunking(): { chunkSize: number; write: (frame: Uint8Array) => Promise<void> } {
    const t = this.transport;
    const mtu = t.info.mtu;
    if (t.writeFast && mtu && this.hasFlag("FAST_UPLOAD")) {
      const chunkSize = Math.min(UPLOAD_CHUNK, mtu - 3 - DATA_FRAME_OVERHEAD);
      if (chunkSize >= MIN_FAST_UPLOAD_CHUNK) return { chunkSize, write: t.writeFast.bind(t) };
    }
    return { chunkSize: UPLOAD_CHUNK, write: t.write.bind(t) };
  }

  readFile(path: string, timeoutMs = DEFAULT_TIMEOUT_MS, onProgress?: ProgressSink, signal?: AbortSignal): Promise<Uint8Array> {
    return this.oneAtATime(signal, () => this.doReadFile(path, timeoutMs, onProgress, signal));
  }

  private async doReadFile(path: string, timeoutMs: number, onProgress?: ProgressSink, signal?: AbortSignal): Promise<Uint8Array> {
    let buf: Uint8Array | null = null;
    let received = 0;
    // Chunks may repeat; count each offset once so `received` reflects unique bytes.
    const seen = new Set<number>();
    const reply = await this.sendRequest(KIND.READ, 0, enc.encode(path), {
      timeoutMs,
      signal,
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

  async ls(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DirEntry[]> {
    const reply = await this.sendRequest(KIND.LS, 0, enc.encode(path), { timeoutMs });
    if (reply.kind === "ERR") throw new Error(dec.decode(reply.payload));
    if (reply.kind !== "DATA") throw new Error("LS: expected DATA reply");
    return parseLsPayload(reply.payload);
  }

  async mv(src: string, dst: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const reply = await this.sendRequest(KIND.MV, 0, encodeTwoPaths(src, dst), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MV failed");
  }

  cp(src: string, dst: string, timeoutMs = DEFAULT_TIMEOUT_MS, signal?: AbortSignal): Promise<void> {
    return this.oneAtATime(signal, () => this.doCp(src, dst, timeoutMs, signal));
  }

  private async doCp(src: string, dst: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    const reply = await this.sendRequest(KIND.CP, 0, encodeTwoPaths(src, dst), { timeoutMs, signal });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "CP failed");
  }

  async rm(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const reply = await this.sendRequest(KIND.RM, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "RM failed");
  }

  async mkdir(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const reply = await this.sendRequest(KIND.MKDIR, 0, enc.encode(path), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "MKDIR failed");
  }

  async abort(targetSeq?: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const payload = targetSeq === undefined ? new Uint8Array(0) : Uint8Array.of(targetSeq & 0xFF);
    const reply = await this.sendRequest(KIND.ABORT, 0, payload, { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "ABORT failed");
  }

  async exec(code: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FrameReply> {
    return this.sendRequest(KIND.EXEC, 0, enc.encode(code), { timeoutMs });
  }

  async cmd(payload: Uint8Array, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FrameReply> {
    const cmdName = payload.length > 0 ? CMD_NAMES.get(payload[0]) : undefined;
    if (this._features && cmdName && !this._features.cmds[cmdName]) {
      throw new UnsupportedFeatureError(cmdName, this._protocolVersion);
    }
    return this.sendRequest(KIND.CMD, 0, payload, { timeoutMs });
  }

  async setBleEcho(enabled: boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<boolean> {
    const reply = await this.sendRequest(KIND.ECHO_BLE, 0, Uint8Array.of(enabled ? 1 : 0), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "ECHO_BLE failed");
    return reply.payload.length > 0 && reply.payload[0] !== 0;
  }

  async remoteDefine(defs: RemoteDef[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    this.assertKind(KIND.REMOTE);
    for (const p of packRemote(REMOTE_OP.DEFINE, defs.map(encodeRemoteDef))) {
      await this.remoteRequest(p, timeoutMs);
    }
  }

  async remoteSet(entries: RemoteSetEntry[], opts: { ack?: boolean; timeoutMs?: number } = {}): Promise<void> {
    this.assertKind(KIND.REMOTE);
    const payloads = packRemote(REMOTE_OP.SET, entries.map(encodeRemoteSet));
    if (opts.ack) {
      for (const p of payloads) await this.remoteRequest(p, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      return;
    }
    // NO_ACK stream. A frame that fits one GATT write goes as one BLE
    // write-without-response; the device drops one that arrives after a newer
    // SET. Bigger frames (or BLE before the MTU handshake) use acknowledged
    // writes, which BLE keeps in order.
    const mtu = this.transport.info.mtu;
    let last = Promise.resolve();
    for (const p of payloads) {
      const frame = makeFrame(KIND.REMOTE, this.nextSeq(), FLAGS_NO_ACK, p);
      const fast = this.transport.writeFast && mtu && frame.length <= mtu - 3;
      const write = fast ? this.transport.writeFast!.bind(this.transport) : this.transport.write.bind(this.transport);
      last = this.sending.then(() => write(frame));
      this.sending = last.catch(() => {});
    }
    await last;
  }

  async remoteClear(ids: number[] = [], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    this.assertKind(KIND.REMOTE);
    ids.forEach(checkRemoteId);
    // CLEAR entries are 1 byte each, so 255 ids always fit one frame.
    await this.remoteRequest(Uint8Array.of(REMOTE_OP.CLEAR, ...ids), timeoutMs);
  }

  private async remoteRequest(payload: Uint8Array, timeoutMs: number): Promise<void> {
    const reply = await this.sendRequest(KIND.REMOTE, 0, payload, { timeoutMs });
    if (reply.kind !== "OK") throw new Error(dec.decode(reply.payload) || "REMOTE failed");
  }

  /** Track message types (for SET decoding) and forward to the sink. */
  private emitRemote(ev: RemoteEvent): void {
    if (ev.op === "define") for (const d of ev.defs) this.remoteMsgTypes.set(d.id, d.type);
    else if (ev.op === "clear") {
      if (ev.ids.length === 0) this.remoteMsgTypes.clear();
      else for (const id of ev.ids) this.remoteMsgTypes.delete(id);
    }
    this.onRemote?.(ev);
  }

  // ── Private send helpers ────────────────────────────────────────────────────

  /**
   * The device runs one stream (UPLOAD, READ or CP) per link at a time and
   * answers any other stream request with ERR "busy". Queue all streams so
   * overlapping callers wait
   * their turn instead of failing. A cancelled / timed-out stream has already
   * queued its ABORT on the send chain, so the next request reaches the
   * device after it.
   */
  private oneAtATime<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    const prev = this.streamTail ?? Promise.resolve();
    const run = prev.then(() => {
      if (this.disposed) throw new Error("Disposed");
      if (signal?.aborted) throw new CancelledError(); // never started: nothing to abort
      return fn();
    });
    const tail = run.then(() => {}, () => {});
    this.streamTail = tail;
    void tail.then(() => { if (this.streamTail === tail) this.streamTail = null; });
    return run;
  }

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
    const blocked = this.kindBlocked(kind);
    if (blocked) return Promise.reject(blocked);
    const seq = this.nextSeq();
    const frame = makeFrame(kind, seq, flags, payload);
    let unwatch = () => {};
    const p = new Promise<FrameReply>((resolve, reject) => {
      const w: Waiter = {
        resolve: (r) => { unwatch(); if (w.cancelling) reject(new CancelledError()); else resolve(r); },
        reject: (e) => { unwatch(); reject(w.cancelling ? new CancelledError() : e); },
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
        w.reject(new Error("protocol timeout"));
      }, opts.timeoutMs);
      this.waiters.set(seq, w);
      if (opts.signal) unwatch = this.watchCancel(seq, opts.signal);
    });
    this.sending = this.sending
      .then(() => {
        console.debug(`[proto] → kind=0x${kind.toString(16).padStart(2,'0')} seq=${seq} ${payload.length}b`);
        const write = opts.fast && this.transport.writeFast
          ? this.transport.writeFast.bind(this.transport)
          : this.transport.write.bind(this.transport);
        return write(frame);
      })
      .catch((e) => { console.error("[protocol] write failed", e); });
    return p;
  }

  private sendNoAck(kind: number, payload: Uint8Array): void {
    this.assertKind(kind);
    const seq = this.nextSeq();
    const frame = makeFrame(kind, seq, FLAGS_NO_ACK, payload);
    const write = (this.transport.writeFast?.bind(this.transport)
      ?? this.transport.write.bind(this.transport));
    this.sending = this.sending.then(() => write(frame)).catch(() => {});
  }

  /** Hook a caller's AbortSignal to cancelStream(); returns the unsubscribe. */
  private watchCancel(seq: number, signal: AbortSignal | undefined, onCancel?: () => void): () => void {
    if (!signal) return () => {};
    const onAbort = () => { this.cancelStream(seq); onCancel?.(); };
    if (signal.aborted) {
      queueMicrotask(onAbort);
      return () => {};
    }
    signal.addEventListener("abort", onAbort, { once: true });
    return () => signal.removeEventListener("abort", onAbort);
  }

  /**
   * User cancel: send ABORT for the stream and keep its waiter until the device
   * ends it — ERR "aborted" on the stream's SEQ, or its own OK / ERR if it
   * finished first (then ABORT gets "no such stream"). The waiter then rejects
   * with CancelledError. Progress / DATA are ignored meanwhile; the normal idle
   * timeout still applies if the device never answers.
   */
  private cancelStream(seq: number): void {
    const w = this.waiters.get(seq);
    if (!w || w.cancelling) return;
    w.cancelling = true;
    console.debug(`[proto] cancel seq=${seq} → ABORT`);
    this.abort(seq).catch(() => { /* "no such stream": its own reply settles the waiter */ });
  }

  /** Fire-and-forget ABORT for a stream we gave up on (its ERR "aborted" is dropped). */
  private sendAbort(targetSeq: number): void {
    if (this.kindBlocked(KIND.ABORT)) return;
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

  private dispatch(seq: number, flags: number, kind: number, payload: Uint8Array): void {
    if (flags & FLAGS_ECHO) {
      // Copy of BLE traffic: its SEQ belongs to the BLE host, never ours.
      this.onEcho?.({
        direction: flags & FLAGS_ECHO_RX ? "rx" : "tx",
        seq,
        flags: flags & ~(FLAGS_ECHO | FLAGS_ECHO_RX),
        kind,
        payload,
      });
      return;
    }
    switch (kind) {
      case KIND.HELLO:
        this.parseHelloPayload(payload);
        break;

      case KIND.OK: {
        console.debug(`[proto] ← OK seq=${seq} ${payload.length}b`);
        const w = this.waiters.get(seq);
        if (w?.requestKind === KIND.RUN) this.programRunning = true;
        this.resolveWaiter(seq, { kind: "OK", payload });
        break;
      }

      case KIND.ERR:
        console.debug(`[proto] ← ERR seq=${seq}`);
        if (seq === SEQ_UNSOLICITED && this.programRunning) {
          // Unsolicited ERR during program = legacy traceback fallback
          this.programRunning = false;
          this.onProgramEnd?.({ ok: false, message: dec.decode(payload) });
        } else {
          this.resolveWaiter(seq, { kind: "ERR", payload });
        }
        break;

      case KIND.ACK: {
        console.debug(`[proto] ← ACK seq=${seq}`);
        this.resetWaiterTimer(seq);
        const w = this.waiters.get(seq);
        if (w?.onAck && !w.cancelling) this.guard(seq, w, () => w.onAck!(payload));
        break;
      }

      case KIND.PROGRESS: {
        this.resetWaiterTimer(seq);
        const w = this.waiters.get(seq);
        if (w?.onProgress && !w.cancelling && payload.length >= 8) {
          const dv = new DataView(payload.buffer, payload.byteOffset);
          this.guard(seq, w, () => w.onProgress!(dv.getUint32(0, false), dv.getUint32(4, false)));
        }
        break;
      }

      case KIND.DATA: {
        const w = this.waiters.get(seq);
        if (w?.onData) {
          this.resetWaiterTimer(seq);
          if (!w.cancelling) this.guard(seq, w, () => w.onData!(payload));
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

      case KIND.REMOTE: {
        // Only ever unsolicited (program messages); replies to our REMOTE are OK / ERR.
        const ev = decodeRemote(payload, this.remoteMsgTypes);
        if (ev) this.emitRemote(ev);
        break;
      }

      default:
        break;
    }
  }

  private parseHelloPayload(payload: Uint8Array): void {
    if (payload.length < 1) return;
    // Pre-1.0.0 firmware sent one proto_ver byte (2..4) followed by the board
    // name; report it as version 0 ("update the hub firmware").
    const printable = (i: number) => payload[i] >= 0x20 && payload[i] < 0x7F;
    const legacy = payload.length < 4 || (payload[0] >= 2 && payload[0] <= 4 && printable(1) && printable(2) && printable(3));
    const protoVer = legacy ? 0 : new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false);
    const readStr = (start: number): [string, number] => {
      let j = start;
      while (j < payload.length && payload[j] !== 0) j++;
      return [dec.decode(payload.slice(start, j)), j + 1];
    };
    const [boardName, i1] = readStr(legacy ? 1 : 4);
    const [boardVersion, i2] = readStr(i1);
    const [fwVersion]        = readStr(i2);
    this._protocolVersion = protoVer;
    this._features = protoFeatures(protoVer);
    this._boardName = boardName;
    this._boardVersion = boardVersion;
    this._fwVersion = fwVersion;
    this.onHello?.({ protocolVersion: protoVer, boardName, boardVersion, fwVersion });
  }

  // ── Binary stream parser ────────────────────────────────────────────────────

  private onChunk(chunk: Uint8Array): void {
    console.debug(`[proto] ← raw ${chunk.length}b hex=${Array.from(chunk.slice(0,16)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}${chunk.length>16?'…':''}`);
    for (const seq of this.waiters.keys()) {
      this.resetWaiterTimer(seq);
    }
    this.parser.feed(chunk);
  }
}
