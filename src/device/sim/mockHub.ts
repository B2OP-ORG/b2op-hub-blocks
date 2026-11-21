// In-browser simulated hub: a Transport that speaks the hub protocol (tests + "Mock" connect option).

import type { DataListener, Transport, TransportInfo, Unsubscribe } from "../transport/types";
import {
  KIND, FLAGS_NO_ACK, FLAGS_ECHO, FLAGS_ECHO_RX, ERR_BUSY, REMOTE_OP, RemoteType, makeFrame, remoteDefault,
  FrameParser, decodeTwoPaths, enc, dec, encodeRemoteDef, encodeRemoteSet, type RemoteValue,
} from "../protocol";
import { frameAck, frameData, frameErr, frameHello, frameOk, frameProgEnd, frameProgress, frameStdout, helloBoardPayload } from "./mockFrames";

const MOCK_MTU = 185;
const PROGRESS_EVERY = 4096;
const READ_CHUNK = 512;

export interface MockOptions {
  stdout?: string;
  files?: Record<string, Uint8Array>;
}

// ── MockTransport ─────────────────────────────────────────────────────────────

export class MockTransport implements Transport {
  readonly kind = "mock" as const;
  readonly info: TransportInfo;
  private _connected = false;
  private dataCbs = new Set<DataListener>();
  private discCbs = new Set<() => void>();
  private parser = new FrameParser((seq, flags, kind, payload) => this.dispatch(seq, flags, kind, payload));
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
  /** ECHO_BLE state (the mock behaves like a USB link). */
  public bleEcho = false;
  /**
   * REMOTE slots, one id space like the firmware (Hub::Remote): host
   * controls (`owner: "host"`) and program messages (`owner: "program"`).
   */
  public remoteControls = new Map<number, { type: RemoteType; name: string; value: RemoteValue; owner: "host" | "program" }>();
  /** SEQ of the last applied REMOTE SET (stale SETs are skipped, like the firmware). */
  private remoteSeq: number | null = null;

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
    this.parser.feed(chunk);
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

  private emit(frame: Uint8Array): void {
    for (const cb of this.dataCbs) cb(frame);
  }

  /** Test hook: deliver a BLE frame copy (FLAGS ECHO, + ECHO_RX for host→hub) if echo is on. */
  emitBleEcho(kind: number, seq: number, payload: Uint8Array, rx: boolean): void {
    if (!this.bleEcho) return;
    this.emit(makeFrame(kind, seq, FLAGS_ECHO | (rx ? FLAGS_ECHO_RX : 0), payload));
  }

  /** One stream (UPLOAD / READ) per link, like the firmware. */
  private get streaming(): boolean {
    return this.pendingUpload !== null || this.activeReads.size > 0;
  }

  private reply(frame: Uint8Array): void {
    queueMicrotask(() => this.emit(frame));
  }

  /** Test hook: send an unsolicited REMOTE frame (program message) to the host. */
  emitRemote(payload: Uint8Array): void {
    this.emit(makeFrame(KIND.REMOTE, 0xFF, 0, payload));
  }

  /** Program slots dropped (host DEFINE / same-name create) → unsolicited CLEAR with their ids. */
  private emitRemoteGone(ids: number[]): void {
    if (ids.length) this.emitRemote(Uint8Array.of(REMOTE_OP.CLEAR, ...ids));
  }

  /** Create / replace slot `id`, dropping another slot with the same name; returns dropped program ids. */
  private defineRemoteSlot(id: number, type: RemoteType, name: string, owner: "host" | "program"): number[] {
    const gone: number[] = [];
    for (const [other, slot] of this.remoteControls) {
      if (slot.name === name && other !== id) {
        if (slot.owner === "program") gone.push(other);
        this.remoteControls.delete(other);
      }
    }
    const prev = this.remoteControls.get(id);
    if (prev?.owner === "program" && owner === "host") gone.push(id);
    this.remoteControls.set(id, { type, name, value: remoteDefault(type), owner });
    return gone;
  }

  /** Test hook: `remote.create_message(id, name, type)` (mirrors Hub::Remote::createMessage); returns an error or null. */
  programCreate(id: number, name: string, type: RemoteType): string | null {
    const cur = this.remoteControls.get(id);
    if (cur?.owner === "host") return cur.name === name && cur.type === type ? null : "id taken";
    for (const [other, slot] of this.remoteControls) {
      if (other !== id && slot.owner === "host" && slot.name === name) return "name taken";
    }
    this.emitRemoteGone(this.defineRemoteSlot(id, type, name, "program"));
    this.emitRemote(Uint8Array.of(REMOTE_OP.DEFINE, ...encodeRemoteDef({ id, type, name })));
    return null;
  }

  /** Test hook: `remote.send(id, value)` on any slot (mirrors Hub::Remote::programSet); returns an error or null. */
  programSend(id: number, value: RemoteValue): string | null {
    const slot = this.remoteControls.get(id);
    if (!slot) return "no slot";
    slot.value = value;
    this.emitRemote(Uint8Array.of(REMOTE_OP.SET, ...encodeRemoteSet({ id, type: slot.type, value })));
    return null;
  }

  /** Test hook: program end (Hub::Remote::clearMessages). */
  programEnd(): void {
    let any = false;
    for (const [id, slot] of this.remoteControls) {
      if (slot.owner === "program") { this.remoteControls.delete(id); any = true; }
    }
    if (any) this.emitRemote(Uint8Array.of(REMOTE_OP.CLEAR));
  }

  /** REMOTE handling (mirrors Protocol.cpp handleRemote); returns an error or null. */
  private handleRemote(seq: number, p: Uint8Array): string | null {
    if (p.length === 0) return "REMOTE: empty";
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    let i = 1;
    switch (p[0]) {
      case REMOTE_OP.DEFINE:
        this.remoteSeq = null;
        while (i < p.length) {
          if (p.length - i < 3) return "REMOTE: short";
          const [id, type, nlen] = [p[i], p[i + 1], p[i + 2]];
          i += 3;
          if (type > RemoteType.Str) return "REMOTE: bad type";
          if (p.length - i < nlen) return "REMOTE: short";
          if (nlen < 1 || nlen > 32) return "REMOTE: bad name";
          const name = dec.decode(p.subarray(i, i + nlen));
          i += nlen;
          this.emitRemoteGone(this.defineRemoteSlot(id, type as RemoteType, name, "host"));
        }
        return null;
      case REMOTE_OP.SET:
        if (this.remoteSeq !== null && ((((seq - this.remoteSeq) & 0xFF) << 24) >> 24) <= 0) return null; // stale
        this.remoteSeq = seq;
        while (i < p.length) {
          const id = p[i++];
          const slot = this.remoteControls.get(id);
          if (!slot) return `REMOTE: unknown id ${id}`;
          const need = slot.type === RemoteType.Bool ? 1 : slot.type === RemoteType.Str ? 1 + (p[i] ?? 0) : 4;
          if (p.length - i < need) return "REMOTE: short";
          slot.value = slot.type === RemoteType.Int ? dv.getInt32(i, false)
            : slot.type === RemoteType.Float ? dv.getFloat32(i, true)
            : slot.type === RemoteType.Bool ? p[i] !== 0
            : dec.decode(p.subarray(i + 1, i + need));
          i += need;
        }
        return null;
      case REMOTE_OP.CLEAR:
        this.remoteSeq = null;
        // Host CLEAR only removes host slots (program messages stay).
        if (p.length === 1) {
          for (const [id, slot] of this.remoteControls) if (slot.owner === "host") this.remoteControls.delete(id);
        }
        for (; i < p.length; i++) if (this.remoteControls.get(p[i])?.owner === "host") this.remoteControls.delete(p[i]);
        return null;
      default:
        return "REMOTE: bad op";
    }
  }

  private dispatch(seq: number, flags: number, kind: number, payload: Uint8Array): void {
    // NO_ACK: process but don't respond (we still handle the command)
    const noAck = !!(flags & FLAGS_NO_ACK);

    switch (kind) {
      case KIND.HELLO_REQ: {
        this.remoteSeq = null; // new host, new SEQ counter
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
        if (this.streaming) { this.reply(frameErr(seq, ERR_BUSY)); break; }
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
        if (this.streaming) { this.reply(frameErr(seq, ERR_BUSY)); break; }
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
        if (this.streaming) { this.reply(frameErr(seq, ERR_BUSY)); break; }
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
      case KIND.ECHO_BLE: {
        if (payload.length) this.bleEcho = payload[0] !== 0;
        if (!noAck) this.reply(frameOk(seq, Uint8Array.of(this.bleEcho ? 1 : 0)));
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
      case KIND.REMOTE: {
        const err = this.handleRemote(seq, payload);
        if (!noAck) this.reply(err ? frameErr(seq, err) : frameOk(seq));
        break;
      }
      default:
        if (!noAck) this.reply(frameErr(seq, `unknown kind: 0x${kind.toString(16)}`));
    }
  }
}
