import type { DataListener, Transport, TransportInfo, Unsubscribe } from "./types";

/**
 * In-memory mock hub speaking the new HubProtocol frame format
 * (0x1E-delimited). Understands RUN / UPLOAD / STOP / READ / PING and echoes
 * OK/ERR/DATA replies. Programs are not actually executed — the mock replies
 * OK to RUN and streams a pre-seeded stdout (see setNextStdout) before OK.
 */
const FRAME_MARK = new TextEncoder().encode("#FR:");
const FRAME_FIRST = FRAME_MARK[0];

function matchMark(chunk: Uint8Array, start: number): boolean {
  if (chunk.length - start < FRAME_MARK.length) return false;
  for (let k = 0; k < FRAME_MARK.length; k++) {
    if (chunk[start + k] !== FRAME_MARK[k]) return false;
  }
  return true;
}

export interface MockOptions {
  stdout?: string;
  files?: Record<string, Uint8Array>;
}

interface PendingUpload {
  path: string;
  remaining: number;
  buf: Uint8Array;
  offset: number;
  total: number;
  lastReported: number;
}

const PROGRESS_EVERY = 2048;

export class MockTransport implements Transport {
  readonly kind = "mock" as const;
  readonly info: TransportInfo;
  private _connected = false;
  private dataCbs = new Set<DataListener>();
  private discCbs = new Set<() => void>();
  private headerBuf: number[] | null = null;
  private pendingUpload: PendingUpload | null = null;
  public files: Record<string, Uint8Array>;
  private nextStdout: string;

  constructor(opts: MockOptions = {}) {
    this.files = { ...(opts.files ?? {}) };
    this.nextStdout = opts.stdout ?? "";
    this.info = { name: "MockDevice", mtu: 185 };
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connected = true;
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

  setNextStdout(s: string): void {
    this.nextStdout = s;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this._connected) throw new Error("Not connected");
    let i = 0;
    while (i < chunk.length) {
      if (this.pendingUpload) {
        const pu = this.pendingUpload;
        const take = Math.min(pu.remaining, chunk.length - i);
        pu.buf.set(chunk.subarray(i, i + take), pu.offset);
        pu.offset += take;
        pu.remaining -= take;
        i += take;
        if (pu.offset - pu.lastReported >= PROGRESS_EVERY && pu.remaining > 0) {
          pu.lastReported = pu.offset;
          this.replyProgress(`${pu.offset}/${pu.total} ${pu.path}`);
        }
        if (pu.remaining === 0) {
          this.files[pu.path] = pu.buf;
          const path = pu.path;
          this.pendingUpload = null;
          this.replyOk(`UPLOAD ${path}`);
        }
        continue;
      }
      if (this.headerBuf !== null) {
        const b = chunk[i++];
        if (b === 0x0a) {
          const header = new TextDecoder().decode(new Uint8Array(this.headerBuf));
          this.headerBuf = null;
          this.handleHeader(header);
        } else {
          this.headerBuf.push(b);
        }
        continue;
      }
      if (chunk[i] === FRAME_FIRST && matchMark(chunk, i)) {
        this.headerBuf = [];
        i += FRAME_MARK.length;
      } else {
        // Bytes outside a frame in web→device direction shouldn't happen; drop.
        i++;
      }
    }
  }

  private handleHeader(header: string): void {
    const sp = header.indexOf(" ");
    const cmd = sp >= 0 ? header.slice(0, sp) : header;
    const rest = sp >= 0 ? header.slice(sp + 1) : "";
    if (cmd === "PING") return this.replyOk("PING");
    if (cmd === "MTU") return this.replyOk(`MTU=${this.info.mtu ?? 185}`);
    if (cmd === "STOP") return this.replyOk("STOP");
    if (cmd === "RUN") {
      const path = rest;
      if (!this.files[path]) return this.replyErr(`no such file: ${path}`);
      if (this.nextStdout) {
        this.emitStdout(this.nextStdout);
        this.nextStdout = "";
      }
      return this.replyOk(`RUN ${path}`);
    }
    if (cmd === "READ") {
      const path = rest;
      const bytes = this.files[path];
      if (!bytes) return this.replyErr(`no such file: ${path}`);
      return this.replyData(bytes, path);
    }
    if (cmd === "UPLOAD") {
      const parts = rest.split(" ");
      if (parts.length < 2) return this.replyErr("UPLOAD: bad header");
      const path = parts.slice(0, -1).join(" ");
      const len = parseInt(parts[parts.length - 1], 10);
      if (Number.isNaN(len) || len < 0) return this.replyErr("UPLOAD: bad length");
      if (path === "/main.py" || path === "/boot.py" || path === "/boot.mpy" || path === "/runner.py") {
        return this.replyErr(`forbidden path: ${path}`);
      }
      if (len === 0) {
        this.replyAck(`UPLOAD ${path} 0`);
        this.files[path] = new Uint8Array(0);
        return this.replyOk(`UPLOAD ${path}`);
      }
      this.replyAck(`UPLOAD ${path} ${len}`);
      this.pendingUpload = {
        path,
        remaining: len,
        buf: new Uint8Array(len),
        offset: 0,
        total: len,
        lastReported: 0,
      };
      return;
    }
    return this.replyErr(`unknown command: ${cmd}`);
  }

  private emit(bytes: Uint8Array): void {
    for (const cb of this.dataCbs) cb(bytes);
  }

  private emitStdout(text: string): void {
    queueMicrotask(() => this.emit(new TextEncoder().encode(text)));
  }

  private replyOk(msg: string): void {
    const frame = new TextEncoder().encode(`#FR:OK ${msg}\n`);
    queueMicrotask(() => this.emit(frame));
  }

  private replyAck(msg: string): void {
    const frame = new TextEncoder().encode(`#FR:ACK ${msg}\n`);
    queueMicrotask(() => this.emit(frame));
  }

  private replyProgress(msg: string): void {
    const frame = new TextEncoder().encode(`#FR:PROGRESS ${msg}\n`);
    queueMicrotask(() => this.emit(frame));
  }

  private replyErr(msg: string): void {
    const frame = new TextEncoder().encode(`#FR:ERR ${msg}\n`);
    queueMicrotask(() => this.emit(frame));
  }

  private replyData(bytes: Uint8Array, msg = ""): void {
    const header = new TextEncoder().encode(`#FR:DATA ${bytes.length}${msg ? " " + msg : ""}\n`);
    const frame = new Uint8Array(header.length + bytes.length);
    frame.set(header, 0);
    frame.set(bytes, header.length);
    queueMicrotask(() => this.emit(frame));
  }
}
