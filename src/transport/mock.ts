import type { DataListener, Transport, TransportInfo, Unsubscribe } from "./types";
import { KIND, FLAGS_NO_ACK, makeFrame } from "../device/protocol";

const PROTO_VER = 3;
const BOARD_NAME = "MockHub";
const BOARD_VERSION = "1.0.0";
const FW_VERSION = "v1.1.0";
const MOCK_MTU = 185;
const PROGRESS_EVERY = 4096;
const READ_CHUNK = 512;

export interface MockOptions {
  stdout?: string;
  files?: Record<string, Uint8Array>;
}

// ── Binary parse state (device mirrors the host-side parser) ──────────────────

const Phase = { Idle: 0, Varint: 1, Fixed: 2, Payload: 3 } as const;
type Phase = typeof Phase[keyof typeof Phase];

interface ParseState {
  phase: Phase;
  varintAccum: number;
  varintShift: number;
  varintBytesRead: number;
  payloadLen: number;
  fixedBuf: number[];
  seq: number;
  flags: number;
  kind: number;
  payloadBuf: Uint8Array;
  payloadOff: number;
}

function freshState(): ParseState {
  return {
    phase: Phase.Idle,
    varintAccum: 0, varintShift: 0, varintBytesRead: 0,
    payloadLen: 0,
    fixedBuf: [],
    seq: 0, flags: 0, kind: 0,
    payloadBuf: new Uint8Array(0), payloadOff: 0,
  };
}

// ── Frame building helpers ────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function frameOk(seq: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  return makeFrame(KIND.OK, seq, 0, payload);
}
function frameErr(seq: number, msg: string): Uint8Array {
  return makeFrame(KIND.ERR, seq, 0, enc.encode(msg));
}
function frameAck(seq: number, msg = ""): Uint8Array {
  return makeFrame(KIND.ACK, seq, 0, msg ? enc.encode(msg) : new Uint8Array(0));
}
function frameProgress(seq: number, sent: number, total: number): Uint8Array {
  const p = new Uint8Array(8);
  const v = new DataView(p.buffer);
  v.setUint32(0, sent, false);
  v.setUint32(4, total, false);
  return makeFrame(KIND.PROGRESS, seq, 0, p);
}
function frameData(seq: number, payload: Uint8Array): Uint8Array {
  return makeFrame(KIND.DATA, seq, 0, payload);
}
function frameStdout(text: string): Uint8Array {
  return makeFrame(KIND.STDOUT, 0xFF, 0, enc.encode(text));
}
function frameProgEnd(ok: boolean, msg = ""): Uint8Array {
  const msgBytes = enc.encode(msg);
  const p = new Uint8Array(1 + msgBytes.length);
  p[0] = ok ? 1 : 0;
  p.set(msgBytes, 1);
  return makeFrame(KIND.PROG_END, 0xFF, 0, p);
}
function frameHello(): Uint8Array {
  return makeFrame(KIND.HELLO, 0xFF, 0, helloBoardPayload());
}

function helloBoardPayload(): Uint8Array {
  const name = enc.encode(BOARD_NAME + "\0");
  const ver  = enc.encode(BOARD_VERSION + "\0");
  const fw   = enc.encode(FW_VERSION + "\0");
  const p = new Uint8Array(1 + name.length + ver.length + fw.length);
  p[0] = PROTO_VER;
  p.set(name, 1);
  p.set(ver, 1 + name.length);
  p.set(fw, 1 + name.length + ver.length);
  return p;
}

// ── MockTransport ─────────────────────────────────────────────────────────────

export class MockTransport implements Transport {
  readonly kind = "mock" as const;
  readonly info: TransportInfo;
  private _connected = false;
  private dataCbs = new Set<DataListener>();
  private discCbs = new Set<() => void>();
  private ps: ParseState = freshState();
  public files: Record<string, Uint8Array>;
  /** Explicitly created (possibly empty) directories, without trailing slash. */
  public dirs = new Set<string>();
  private _nextStdout: string;
  /** Active UPLOAD: DATA chunks [offset][bytes] fill `buf`; `done` = contiguous bytes written. */
  private pendingUpload: { seq: number; path: string; buf: Uint8Array; done: number; lastReport: number } | null = null;
  /** Active READ streams by SEQ (ABORT stops them). */
  private activeReads = new Set<number>();
  /** Test hook: when true, READ chunks are only sent when `pumpRead()` is called. */
  public manualRead = false;
  private readQueue: (() => void)[] = [];

  constructor(opts: MockOptions = {}) {
    this.files = { ...(opts.files ?? {}) };
    this._nextStdout = opts.stdout ?? "";
    this.info = { name: "MockDevice", mtu: MOCK_MTU };
  }

  get connected(): boolean { return this._connected; }

  async connect(): Promise<void> {
    this._connected = true;
    queueMicrotask(() => this.emit(frameHello()));
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    for (const cb of this.discCbs) cb();
  }

  onData(cb: DataListener): Unsubscribe {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onDisconnect(cb: () => void): Unsubscribe {
    this.discCbs.add(cb);
    return () => this.discCbs.delete(cb);
  }

  setNextStdout(s: string): void { this._nextStdout = s; }

  writeFast(chunk: Uint8Array): Promise<void> { return this.write(chunk); }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this._connected) throw new Error("Not connected");
    for (let i = 0; i < chunk.length; ) {
      i = this.feedByte(chunk[i], i, chunk);
    }
  }

  /** Send queued READ chunks (only used with `manualRead`). Returns how many were sent. */
  pumpRead(n = Infinity): number {
    let sent = 0;
    while (sent < n && this.readQueue.length) { this.readQueue.shift()!(); sent++; }
    return sent;
  }

  private uploadChunk(seq: number, payload: Uint8Array): void {
    const up = this.pendingUpload;
    if (!up || up.seq !== seq) { this.reply(frameErr(seq, "DATA: no active upload")); return; }
    if (payload.length < 4) { this.pendingUpload = null; this.reply(frameErr(seq, "UPLOAD: bad chunk")); return; }
    const off = new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false);
    const data = payload.subarray(4);
    if (off !== up.done) return; // mock: in-order only; duplicates ignored
    up.buf.set(data.subarray(0, up.buf.length - off), off);
    up.done = Math.min(up.buf.length, off + data.length);
    const total = up.buf.length;
    if (up.done === total) {
      this.pendingUpload = null;
      this.files[up.path] = up.buf;
      this.reply(frameProgress(seq, total, total));
      this.reply(frameOk(seq));
    } else if (up.done - up.lastReport >= PROGRESS_EVERY) {
      up.lastReport = up.done;
      this.reply(frameProgress(seq, up.done, total));
    }
  }

  private startRead(seq: number, bytes: Uint8Array): void {
    this.activeReads.add(seq);
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, bytes.length, false);
    this.reply(makeFrame(KIND.ACK, seq, 0, size));
    const steps: (() => void)[] = [];
    for (let off = 0; off < bytes.length; off += READ_CHUNK) {
      steps.push(() => {
        if (!this.activeReads.has(seq)) return;
        const data = bytes.subarray(off, off + READ_CHUNK);
        const p = new Uint8Array(4 + data.length);
        new DataView(p.buffer).setUint32(0, off, false);
        p.set(data, 4);
        this.emit(frameData(seq, p));
      });
    }
    steps.push(() => {
      if (!this.activeReads.delete(seq)) return;
      this.emit(frameOk(seq));
    });
    if (this.manualRead) this.readQueue.push(...steps);
    else for (const st of steps) queueMicrotask(st);
  }

  // Returns the new index after consuming bytes.
  private feedByte(b: number, i: number, chunk: Uint8Array): number {
    const ps = this.ps;
    switch (ps.phase) {
      case Phase.Idle:
        if (b === 0x7E) { ps.phase = Phase.Varint; ps.varintAccum = 0; ps.varintShift = 0; ps.varintBytesRead = 0; }
        return i + 1;

      case Phase.Varint: {
        ps.varintAccum |= (b & 0x7F) << ps.varintShift;
        ps.varintShift += 7;
        ps.varintBytesRead++;
        const done = !(b & 0x80) || ps.varintBytesRead === 5;
        if (done) {
          ps.payloadLen = ps.varintAccum;
          ps.fixedBuf = [];
          ps.phase = Phase.Fixed;
        }
        return i + 1;
      }

      case Phase.Fixed:
        ps.fixedBuf.push(b);
        if (ps.fixedBuf.length === 3) {
          ps.seq   = ps.fixedBuf[0];
          ps.flags = ps.fixedBuf[1];
          ps.kind  = ps.fixedBuf[2];
          if (ps.payloadLen === 0) {
            this.dispatch(ps.seq, ps.flags, ps.kind, new Uint8Array(0));
            this.ps = freshState();
          } else {
            ps.payloadBuf = new Uint8Array(ps.payloadLen);
            ps.payloadOff = 0;
            ps.phase = Phase.Payload;
          }
        }
        return i + 1;

      case Phase.Payload: {
        const take = Math.min(ps.payloadLen - ps.payloadOff, chunk.length - i);
        ps.payloadBuf.set(chunk.subarray(i, i + take), ps.payloadOff);
        ps.payloadOff += take;
        if (ps.payloadOff === ps.payloadLen) {
          const payload = ps.payloadBuf;
          const { seq, flags, kind } = ps;
          this.ps = freshState();
          this.dispatch(seq, flags, kind, payload);
        }
        return i + take;
      }
    }
  }

  private emit(frame: Uint8Array): void {
    for (const cb of this.dataCbs) cb(frame);
  }

  private reply(frame: Uint8Array): void {
    queueMicrotask(() => this.emit(frame));
  }

  private dispatch(seq: number, flags: number, kind: number, payload: Uint8Array): void {
    // NO_ACK: process but don't respond (we still handle the command)
    const noAck = !!(flags & FLAGS_NO_ACK);

    switch (kind) {
      case KIND.HELLO_REQ: {
        if (!noAck) this.reply(frameOk(seq, helloBoardPayload()));
        break;
      }
      case KIND.PING: {
        if (!noAck) this.reply(frameOk(seq));
        break;
      }
      case KIND.MTU_REQ: {
        if (!noAck) {
          const p = new Uint8Array(2);
          new DataView(p.buffer).setUint16(0, MOCK_MTU, false);
          this.reply(frameOk(seq, p));
        }
        break;
      }
      case KIND.STOP: {
        if (!noAck) this.reply(frameOk(seq));
        break;
      }
      case KIND.RUN: {
        const path = dec.decode(payload);
        if (!this.files[path]) {
          if (!noAck) this.reply(frameErr(seq, `no such file: ${path}`));
          break;
        }
        if (!noAck) this.reply(frameOk(seq));
        const stdout = this._nextStdout;
        this._nextStdout = "";
        queueMicrotask(() => {
          if (stdout) this.emit(frameStdout(stdout));
          this.emit(frameProgEnd(true));
        });
        break;
      }
      case KIND.UPLOAD: {
        // [path_len:u8][path][file_size:u32 BE] → ACK, then DATA [offset][bytes] chunks → PROGRESS* → OK
        if (payload.length < 1) { this.reply(frameErr(seq, "UPLOAD: empty payload")); break; }
        const pathLen = payload[0];
        if (1 + pathLen + 4 > payload.length) { this.reply(frameErr(seq, "UPLOAD: bad header")); break; }
        const path = dec.decode(payload.subarray(1, 1 + pathLen));
        const size = new DataView(payload.buffer, payload.byteOffset + 1 + pathLen, 4).getUint32(0, false);
        if (this.pendingUpload) { this.reply(frameErr(seq, "UPLOAD busy")); break; }
        this.reply(frameAck(seq));
        if (size === 0) {
          this.files[path] = new Uint8Array(0);
          this.reply(frameOk(seq));
        } else {
          this.pendingUpload = { seq, path, buf: new Uint8Array(size), done: 0, lastReport: 0 };
        }
        break;
      }
      case KIND.DATA: {
        this.uploadChunk(seq, payload);
        break;
      }
      case KIND.READ: {
        const path = dec.decode(payload);
        const bytes = this.files[path];
        if (!bytes) { this.reply(frameErr(seq, `read: no such file: ${path}`)); break; }
        if (this.activeReads.size) { this.reply(frameErr(seq, "READ busy")); break; }
        this.startRead(seq, bytes);
        break;
      }
      case KIND.ABORT: {
        const target = payload.length ? payload[0] : null;
        let hit = false;
        if (this.pendingUpload && (target === null || this.pendingUpload.seq === target)) {
          this.reply(frameErr(this.pendingUpload.seq, "aborted"));
          this.pendingUpload = null;
          hit = true;
        }
        for (const r of [...this.activeReads]) {
          if (target !== null && r !== target) continue;
          this.activeReads.delete(r);
          this.reply(frameErr(r, "aborted"));
          hit = true;
        }
        if (target !== null && !hit) this.reply(frameErr(seq, "ABORT: no such stream"));
        else this.reply(frameOk(seq));
        break;
      }
      case KIND.LS: {
        const path = dec.decode(payload);
        // Gather entries from files map whose keys start with path/
        const prefix = path.endsWith("/") ? path : path + "/";
        const seen = new Set<string>();
        const entries: { name: string; isDir: boolean }[] = [];
        for (const key of Object.keys(this.files)) {
          if (!key.startsWith(prefix)) continue;
          const rel = key.slice(prefix.length);
          const sep = rel.indexOf("/");
          if (sep === -1) {
            if (!seen.has(rel)) { seen.add(rel); entries.push({ name: rel, isDir: false }); }
          } else {
            const dir = rel.slice(0, sep);
            if (!seen.has(dir)) { seen.add(dir); entries.push({ name: dir, isDir: true }); }
          }
        }
        for (const d of this.dirs) {
          if (!d.startsWith(prefix)) continue;
          const name = d.slice(prefix.length).split("/")[0];
          if (name && !seen.has(name)) { seen.add(name); entries.push({ name, isDir: true }); }
        }
        // Pack [is_dir:u8][name\0]...
        const parts: Uint8Array[] = entries.map(e => {
          const nb = enc.encode(e.name + "\0");
          const r = new Uint8Array(1 + nb.length);
          r[0] = e.isDir ? 1 : 0;
          r.set(nb, 1);
          return r;
        });
        const total = parts.reduce((s, p) => s + p.length, 0);
        const packed = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { packed.set(p, off); off += p.length; }
        if (!noAck) this.reply(frameData(seq, packed));
        break;
      }
      case KIND.MV: {
        const result = decodeTwoPaths(payload);
        if (!result) { if (!noAck) this.reply(frameErr(seq, "MV: bad payload")); break; }
        const [src, dst] = result;
        if (!this.files[src]) { if (!noAck) this.reply(frameErr(seq, `no such file: ${src}`)); break; }
        this.files[dst] = this.files[src];
        delete this.files[src];
        if (!noAck) this.reply(frameOk(seq));
        break;
      }
      case KIND.CP: {
        const result = decodeTwoPaths(payload);
        if (!result) { if (!noAck) this.reply(frameErr(seq, "CP: bad payload")); break; }
        const [src, dst] = result;
        if (!this.files[src]) { if (!noAck) this.reply(frameErr(seq, `no such file: ${src}`)); break; }
        this.reply(frameAck(seq));
        this.files[dst] = this.files[src].slice();
        this.reply(frameOk(seq));
        break;
      }
      case KIND.RM: {
        const path = dec.decode(payload);
        if (!this.files[path]) { if (!noAck) this.reply(frameErr(seq, `no such file: ${path}`)); break; }
        delete this.files[path];
        if (!noAck) this.reply(frameOk(seq));
        break;
      }
      case KIND.MKDIR: {
        const path = dec.decode(payload).replace(/\/+$/, "");
        if (!path.startsWith("/")) { if (!noAck) this.reply(frameErr(seq, "MKDIR: relative path")); break; }
        if (this.files[path]) { if (!noAck) this.reply(frameErr(seq, `not a directory: ${path}`)); break; }
        let cur = "";
        for (const seg of path.split("/").filter(Boolean)) {
          cur += "/" + seg;
          this.dirs.add(cur);
        }
        if (!noAck) this.reply(frameOk(seq));
        break;
      }
      default:
        if (!noAck) this.reply(frameErr(seq, `unknown kind: 0x${kind.toString(16)}`));
    }
  }
}

function decodeTwoPaths(payload: Uint8Array): [string, string] | null {
  if (payload.length < 1) return null;
  const srcLen = payload[0];
  if (1 + srcLen + 1 > payload.length) return null;
  const src = new TextDecoder().decode(payload.subarray(1, 1 + srcLen));
  const dstLen = payload[1 + srcLen];
  if (1 + srcLen + 1 + dstLen > payload.length) return null;
  const dst = new TextDecoder().decode(payload.subarray(1 + srcLen + 1, 1 + srcLen + 1 + dstLen));
  return [src, dst];
}
