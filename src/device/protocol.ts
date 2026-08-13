import type { Transport, Unsubscribe } from "../transport/types";

/**
 * Hub wire protocol. Replaces raw MicroPython REPL entirely for run/upload/stop.
 *
 * Frame delimiter: 0x1E (ASCII Record Separator).
 *
 * Web → Device:
 *   #FR:RUN <path>\n                       - launch runner.run_program(path)
 *   #FR:UPLOAD <path> <len>\n<len bytes>  - write file
 *   #FR:STOP\n                             - request stop (runner exits between loop iters)
 *   #FR:READ <path>\n                      - read file, reply DATA
 *   #FR:PING\n                             - health check
 *
 * Device → Web:
 *   #FR:ACK <msg>\n                        - long op accepted (header parsed); resets idle timeout
 *   #FR:PROGRESS <sent>/<total> <msg>\n    - long op progress; resets idle timeout
 *   #FR:OK <msg>\n                         - control success (final for long ops)
 *   #FR:ERR <msg>\n                        - control error
 *   #FR:DATA <len>\n<len bytes>            - binary payload (READ)
 *   #FR:OUT <len>\n<len bytes>             - stdout chunk (unsolicited, from sys.stdout)
 *   #FR:STDERR <len>\n<len bytes>          - stderr chunk (unsolicited, from sys.stderr)
 *   any other bytes                        - stdout fallback (pre-redirect / raw REPL)
 *
 * Encoding: header line is UTF-8; payload after DATA/UPLOAD header is raw bytes
 * of exact declared length (no escaping).
 */

// Frame delimiter. Multi-char printable marker chosen because some MicroPython
// builds strip control bytes < 0x20 on the stdout side (device→web), so a
// single-byte RS would get silently dropped.
const FRAME_MARK = new TextEncoder().encode("#FR:");

function indexOfMark(buf: Uint8Array, start: number): number {
  const end = buf.length - FRAME_MARK.length;
  outer: for (let i = start; i <= end; i++) {
    for (let k = 0; k < FRAME_MARK.length; k++) {
      if (buf[i + k] !== FRAME_MARK[k]) continue outer;
    }
    return i;
  }
  return -1;
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

export type StdoutSink = (chunk: string) => void;
export type StderrSink = (chunk: string) => void;
export interface ProgramEndInfo {
  ok: boolean;
  message: string;
}
export type ProgramEndSink = (info: ProgramEndInfo) => void;

export type ProgressSink = (sent: number, total: number) => void;

interface Waiter {
  resolve: (reply: FrameReply) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  idleTimeoutMs: number;
  onProgress?: ProgressSink;
}

interface SendOptions {
  timeoutMs: number;
  onProgress?: ProgressSink;
}

export interface FrameReply {
  kind: "OK" | "ERR" | "DATA";
  message: string;
  data?: Uint8Array;
}

interface ParseState {
  /** null = scanning stdout; else = collected header bytes after RS (excluding RS itself) */
  headerBuf: number[] | null;
  /** if reading DATA/OUT/STDERR payload, bytes remaining */
  dataRemaining: number;
  dataKind: "DATA" | "OUT" | "STDERR" | null;
  dataMessage: string;
  dataBuf: Uint8Array | null;
  dataOffset: number;
}

export class HubProtocol {
  private transport: Transport;
  private unsub: Unsubscribe | null = null;
  private onStdout: StdoutSink | null = null;
  private onStderr: StderrSink | null = null;
  private onProgramEnd: ProgramEndSink | null = null;
  private programRunning = false;
  private waiters: Waiter[] = [];
  private state: ParseState = {
    headerBuf: null,
    dataRemaining: 0,
    dataKind: null,
    dataMessage: "",
    dataBuf: null,
    dataOffset: 0,
  };
  private sending = Promise.resolve();

  constructor(transport: Transport) {
    this.transport = transport;
    this.unsub = transport.onData((chunk) => this.onChunk(chunk));
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    for (const w of this.waiters) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(new Error("Disposed"));
    }
    this.waiters = [];
    if (this.programRunning) {
      this.programRunning = false;
      this.onProgramEnd?.({ ok: false, message: "disconnected" });
    }
  }

  setStdoutSink(sink: StdoutSink | null): void {
    this.onStdout = sink;
  }

  setStderrSink(sink: StderrSink | null): void {
    this.onStderr = sink;
  }

  setProgramEndSink(sink: ProgramEndSink | null): void {
    this.onProgramEnd = sink;
  }

  isProgramRunning(): boolean {
    return this.programRunning;
  }

  async ping(timeoutMs = 3000): Promise<void> {
    const reply = await this.send(enc.encode("#FR:PING\n"), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(reply.message || "PING failed");
  }

  /**
   * Ask device for its effective ATT MTU. Reply: `OK MTU=<n>`.
   * Returns the parsed integer, or throws on ERR / malformed reply.
   */
  async mtu(timeoutMs = 3000): Promise<number> {
    const reply = await this.send(enc.encode("#FR:MTU\n"), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(reply.message || "MTU failed");
    const m = /^MTU=(\d+)$/.exec(reply.message.trim());
    if (!m) throw new Error(`MTU: bad reply "${reply.message}"`);
    return parseInt(m[1], 10);
  }

  async runProgram(path: string, timeoutMs = 15000): Promise<void> {
    const reply = await this.send(enc.encode(`#FR:RUN ${path}\n`), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(reply.message || "RUN failed");
    this.programRunning = true;
  }

  async stop(timeoutMs = 3000): Promise<void> {
    const reply = await this.send(enc.encode("#FR:STOP\n"), { timeoutMs });
    if (reply.kind !== "OK") throw new Error(reply.message || "STOP failed");
    // The runner also emits `OK done <path>` shortly after; that frame is
    // dropped since programRunning is already false here.
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
    // Reliable path only. A writeValueWithoutResponse fast path was tried and
    // produced silently reordered/duplicated chunks on Linux/BlueZ (device saw
    // the correct byte count but scrambled content). Web Bluetooth spec does
    // not guarantee ordering across separate WriteWithoutResponse calls; a
    // fast path needs app-layer sequence numbers to be safe.
    const header = enc.encode(`#FR:UPLOAD ${path} ${bytes.length}\n`);
    const frame = new Uint8Array(header.length + bytes.length);
    frame.set(header, 0);
    frame.set(bytes, header.length);
    const reply = await this.send(frame, { timeoutMs: idleTimeoutMs, onProgress });
    if (reply.kind !== "OK") throw new Error(reply.message || "UPLOAD failed");
  }

  async readFile(path: string, timeoutMs = 10000): Promise<Uint8Array> {
    const reply = await this.send(enc.encode(`#FR:READ ${path}\n`), { timeoutMs });
    if (reply.kind === "ERR") throw new Error(reply.message);
    if (reply.kind !== "DATA" || !reply.data) throw new Error("READ: expected DATA reply");
    return reply.data;
  }

  private send(frame: Uint8Array, opts: SendOptions): Promise<FrameReply> {
    const p = new Promise<FrameReply>((resolve, reject) => {
      const w: Waiter = {
        resolve,
        reject,
        idleTimeoutMs: opts.timeoutMs,
        onProgress: opts.onProgress,
      };
      w.timer = setTimeout(() => {
        const idx = this.waiters.indexOf(w);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error("protocol timeout"));
      }, opts.timeoutMs);
      this.waiters.push(w);
    });
    this.sending = this.sending
      .then(() => this.transport.write(frame))
      .catch((e) => {
        console.error("[protocol] transport.write failed", e);
      });
    return p;
  }

  private resolveNext(reply: FrameReply): void {
    const w = this.waiters.shift();
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    w.resolve(reply);
  }

  private resetHeadTimer(): void {
    const w = this.waiters[0];
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      const idx = this.waiters.indexOf(w);
      if (idx >= 0) this.waiters.splice(idx, 1);
      w.reject(new Error("protocol timeout"));
    }, w.idleTimeoutMs);
  }

  private stdoutTail = new Uint8Array(0);

  private onChunk(chunk: Uint8Array): void {
    // Prepend any tail from previous chunk (potential partial FRAME_MARK prefix).
    if (this.stdoutTail.length) {
      const merged = new Uint8Array(this.stdoutTail.length + chunk.length);
      merged.set(this.stdoutTail, 0);
      merged.set(chunk, this.stdoutTail.length);
      chunk = merged;
      this.stdoutTail = new Uint8Array(0);
    }
    let i = 0;
    while (i < chunk.length) {
      if (this.state.dataBuf) {
        const need = this.state.dataRemaining;
        const take = Math.min(need, chunk.length - i);
        this.state.dataBuf.set(chunk.subarray(i, i + take), this.state.dataOffset);
        this.state.dataOffset += take;
        this.state.dataRemaining -= take;
        i += take;
        if (this.state.dataRemaining === 0) {
          const buf = this.state.dataBuf;
          const msg = this.state.dataMessage;
          const kind = this.state.dataKind;
          this.state.dataBuf = null;
          this.state.dataOffset = 0;
          this.state.dataMessage = "";
          this.state.dataKind = null;
          if (kind === "OUT") {
            this.onStdout?.(dec.decode(buf));
          } else if (kind === "STDERR") {
            this.onStderr?.(dec.decode(buf));
          } else {
            this.resolveNext({ kind: "DATA", message: msg, data: buf });
          }
        }
        continue;
      }
      if (this.state.headerBuf !== null) {
        const b = chunk[i++];
        if (b === 0x0a) {
          const line = new Uint8Array(this.state.headerBuf);
          this.state.headerBuf = null;
          this.handleHeader(dec.decode(line));
        } else {
          this.state.headerBuf.push(b);
        }
        continue;
      }
      // Scan for FRAME_MARK. Bytes before it are stdout.
      const markIdx = indexOfMark(chunk, i);
      if (markIdx < 0) {
        // Emit stdout up to the last plausible partial-mark start.
        const safeEnd = Math.max(i, chunk.length - (FRAME_MARK.length - 1));
        if (safeEnd > i && this.onStdout) {
          this.onStdout(dec.decode(chunk.subarray(i, safeEnd)));
        }
        // Save trailing bytes that might be a partial mark.
        if (safeEnd < chunk.length) {
          this.stdoutTail = new Uint8Array(chunk.subarray(safeEnd));
        }
        return;
      }
      if (markIdx > i && this.onStdout) {
        this.onStdout(dec.decode(chunk.subarray(i, markIdx)));
      }
      this.state.headerBuf = [];
      i = markIdx + FRAME_MARK.length;
    }
  }

  private handleHeader(header: string): void {
    // header format: "<KIND> <message>" or "DATA <len>"
    const spaceIdx = header.indexOf(" ");
    const kind = spaceIdx >= 0 ? header.slice(0, spaceIdx) : header;
    const rest = spaceIdx >= 0 ? header.slice(spaceIdx + 1) : "";
    if (kind === "ACK") {
      // Long op accepted; reset the head waiter's idle timer.
      this.resetHeadTimer();
      return;
    }
    if (kind === "PROGRESS") {
      this.resetHeadTimer();
      const w = this.waiters[0];
      if (w?.onProgress) {
        const m = /^(\d+)\/(\d+)/.exec(rest);
        if (m) w.onProgress(parseInt(m[1], 10), parseInt(m[2], 10));
      }
      return;
    }
    if (kind === "OK") {
      // Program lifecycle: `OK done <path>` arrives after the runner returns.
      if (this.programRunning && rest.startsWith("done ")) {
        this.programRunning = false;
        this.onProgramEnd?.({ ok: true, message: rest });
        return;
      }
      this.resolveNext({ kind: "OK", message: rest });
    } else if (kind === "ERR") {
      // Unsolicited ERR while a program is running = traceback from the runner.
      if (this.programRunning && this.waiters.length === 0) {
        this.programRunning = false;
        this.onProgramEnd?.({ ok: false, message: rest });
        return;
      }
      this.resolveNext({ kind: "ERR", message: rest });
    } else if (kind === "DATA" || kind === "OUT" || kind === "STDERR") {
      const spIdx = rest.indexOf(" ");
      const lenStr = spIdx >= 0 ? rest.slice(0, spIdx) : rest;
      const msg = spIdx >= 0 ? rest.slice(spIdx + 1) : "";
      const len = parseInt(lenStr, 10);
      if (Number.isNaN(len) || len < 0) {
        if (kind === "DATA") this.resolveNext({ kind: "ERR", message: "bad DATA header" });
        return;
      }
      if (len === 0) {
        if (kind === "DATA") {
          this.resolveNext({ kind: "DATA", message: msg, data: new Uint8Array(0) });
        }
        return;
      }
      this.state.dataBuf = new Uint8Array(len);
      this.state.dataRemaining = len;
      this.state.dataOffset = 0;
      this.state.dataMessage = msg;
      this.state.dataKind = kind;
    } else {
      // Unknown frame — drop, don't resolve.
    }
  }
}

const FORBIDDEN = new Set(["/main.py", "/boot.py", "/boot.mpy", "/runner.py"]);

export class UploadError extends Error {}

export interface UploadPolicy {
  allowRoot: boolean;
}

export function validatePath(path: string, policy: UploadPolicy): void {
  if (FORBIDDEN.has(path)) throw new UploadError(`Forbidden path: ${path}`);
  if (path.startsWith("/sd/")) return;
  if (policy.allowRoot && path.startsWith("/") && !path.startsWith("//")) return;
  throw new UploadError(`Path must be under /sd/ (allowRoot=${policy.allowRoot}): ${path}`);
}
