import type { Transport } from "../transport/types";
import { HubProtocol, validatePath, type UploadPolicy, type ProgramEndSink, type DirEntry } from "./protocol";
import { sanitizeFilename } from "../utils/sanitize";

export type ConsoleSink = (text: string) => void;

export interface RunOptions {
  onStdout?: ConsoleSink;
  onStderr?: ConsoleSink;
  timeoutMs?: number;
}

export interface UploadRunOptions {
  policy: UploadPolicy;
  autoRun?: boolean;
  onProgress?: (sent: number, total: number) => void;
  onStdout?: ConsoleSink;
  onStderr?: ConsoleSink;
}

export interface UploadResult {
  path: string;
  length: number;
}

const TMP_RUN_NAME = "__web_run.py";

/**
 * High-level device operations over the HubProtocol side channel.
 * `run(code)` uploads the source as a temp file and asks the on-device runner
 * to execute it via `runner.run_program(path)`. No raw REPL anywhere.
 */
export class DeviceClient {
  private proto: HubProtocol;
  readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    this.proto = new HubProtocol(transport);
  }

  get boardName(): string { return this.proto.boardName; }
  get boardVersion(): string { return this.proto.boardVersion; }
  get protocolVersion(): number { return this.proto.protocolVersion; }

  async connect(): Promise<void> {
    await this.transport.connect();
    // Two ping attempts — cold connects sometimes drop the first frame while
    // USB CDC state settles. Both failing is still non-fatal; caller can retry.
    let pinged = false;
    for (let i = 0; i < 2; i++) {
      try {
        await this.proto.ping(3000);
        pinged = true;
        break;
      } catch {
        // fall through and retry
      }
    }
    if (pinged) {
      // Fetch board identity (HELLO may have arrived proactively; requestHello
      // sends HELLO_REQ and waits for OK with board-info payload if not yet set).
      try { await this.proto.requestHello(3000); } catch { /* non-fatal */ }

      if (this.transport.setChunkSize) {
        // Device queries `_ble_uart.instance().mtu()`, which reflects the last
        // ATT MTU exchange. Peripheral triggers the exchange on connect, but it
        // takes a few conn intervals; a query fired immediately after ping may
        // still see the default 23. Retry once after a short delay if so.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const mtu = await this.proto.mtu(1500);
            if (mtu > 23 || attempt === 1) {
              // ATT MTU includes 3 opcode/handle bytes; usable payload = mtu - 3.
              this.transport.setChunkSize(mtu - 3);
              break;
            }
            await new Promise((r) => setTimeout(r, 400));
          } catch {
            // Handshake optional — device without MTU support keeps default chunk.
            break;
          }
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    // Skip stop if transport never connected — avoids a 3-second waiter timeout
    // when disconnect() is called from the error-cleanup path.
    if (this.transport.connected) {
      try { await this.proto.stop(false, 3000); } catch { /* noop */ }
    }
    this.proto.dispose();
    await this.transport.disconnect();
  }

  async run(code: string, opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const path = `/sd/${TMP_RUN_NAME}`;
    let stdout = "";
    let stderr = "";
    const outSink = (t: string) => {
      stdout += t;
      opts.onStdout?.(t);
    };
    const errSink = (t: string) => {
      stderr += t;
      opts.onStderr?.(t);
    };
    // Sinks stay installed after runProgram() resolves — that resolves on the
    // first `OK RUN <path>` ack, but the user program keeps emitting OUT/STDERR
    // frames until it exits. Next run/upload/dispose replaces them.
    this.proto.setStdoutSink(outSink);
    this.proto.setStderrSink(errSink);
    const bytes = new TextEncoder().encode(code);
    await this.proto.upload(path, bytes);
    await this.proto.runProgram(path, opts.timeoutMs ?? 15000);
    return { stdout, stderr };
  }

  async stop(): Promise<void> {
    await this.proto.stop();
  }

  setProgramEndSink(sink: ProgramEndSink | null): void {
    this.proto.setProgramEndSink(sink);
  }

  isProgramRunning(): boolean {
    return this.proto.isProgramRunning();
  }

  async readFile(path: string, opts: { timeoutMs?: number } = {}): Promise<string> {
    const bytes = await this.proto.readFile(path, opts.timeoutMs ?? 10000);
    return new TextDecoder().decode(bytes);
  }

  async upload(path: string, bytes: Uint8Array, opts: UploadRunOptions): Promise<UploadResult> {
    validatePath(path, opts.policy);
    const outSink = opts.onStdout ? (t: string) => opts.onStdout!(t) : null;
    const errSink = opts.onStderr ? (t: string) => opts.onStderr!(t) : null;
    this.proto.setStdoutSink(outSink);
    this.proto.setStderrSink(errSink);
    await this.proto.upload(path, bytes, 15000, opts.onProgress);
    opts.onProgress?.(bytes.length, bytes.length);
    if (opts.autoRun) {
      await this.proto.runProgram(path);
    }
    return { path, length: bytes.length };
  }

  async ls(path: string, opts: { timeoutMs?: number } = {}): Promise<DirEntry[]> {
    return this.proto.ls(path, opts.timeoutMs ?? 10000);
  }

  async mv(src: string, dst: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    return this.proto.mv(src, dst, opts.timeoutMs ?? 10000);
  }

  async cp(src: string, dst: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    return this.proto.cp(src, dst, opts.timeoutMs ?? 10000);
  }

  async rm(path: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    return this.proto.rm(path, opts.timeoutMs ?? 10000);
  }
}

/** Path web app uses for Run-button uploads. Exposed so UI can display it. */
export function runButtonPath(projectTitle: string, allowRoot: boolean): string {
  const base = sanitizeFilename(projectTitle);
  return (allowRoot ? "/" : "/sd/") + base + ".py";
}
