import type { Transport } from "../transport/types";
import { HubProtocolV1, protoVersionError, DEFAULT_TIMEOUT_MS, validatePath, type UploadPolicy, type ProgramEndSink, type ProgramStartSink, type DirEntry, type StdoutSink, type StderrSink, type EchoSink, type RemoteDef, type RemoteSetEntry, type RemoteSink } from "./protocol";
import type { CmdName, KindName, ProtoFeatures } from "./protocolFeatures";
import { sanitizeFilename } from "../utils/sanitize";
import { useApp } from "../state/store";

const dec = new TextDecoder("utf-8", { fatal: false });

export type ConsoleSink = (text: string) => void;

export interface ExecResult {
  ok: boolean;
  stdout: string;
  error?: string;
}

export interface RunOptions {
  onStdout?: ConsoleSink;
  onStderr?: ConsoleSink;
  timeoutMs?: number;
}

export interface UploadRunOptions {
  policy: UploadPolicy;
  autoRun?: boolean;
  onProgress?: (sent: number, total: number) => void;
  /** Abort → ABORT frame; rejects with CancelledError once the hub confirms. */
  signal?: AbortSignal;
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
  private proto: HubProtocolV1;
  readonly transport: Transport;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pinging = false;
  private bleEcho = false;

  constructor(transport: Transport) {
    this.transport = transport;
    this.proto = new HubProtocolV1(transport);
  }

  get boardName(): string { return this.proto.boardName; }
  get boardVersion(): string { return this.proto.boardVersion; }
  get fwVersion(): string { return this.proto.fwVersion; }
  get protocolVersion(): number { return this.proto.protocolVersion; }

  /**
   * Features of the connected hub's protocol minor, or null before HELLO (or
   * if HELLO failed); null means nothing is blocked. Unsupported requests
   * reject with UnsupportedFeatureError.
   */
  get features(): ProtoFeatures | null { return this.proto.features; }

  /** Whether the hub implements message type `kind` (true while unknown). */
  supportsKind(kind: KindName): boolean {
    return this.proto.features?.kinds[kind] ?? true;
  }

  /** Whether the hub implements CMD subtype `cmd` (true while unknown). */
  supportsCmd(cmd: CmdName): boolean {
    return this.proto.features?.cmds[cmd] ?? true;
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    // Two ping attempts — cold connects sometimes drop the first frame while
    // USB CDC state settles. Both failing is still non-fatal; caller can retry.
    let pinged = false;
    for (let i = 0; i < 2; i++) {
      try {
        await this.proto.ping(DEFAULT_TIMEOUT_MS);
        pinged = true;
        break;
      } catch {
        // fall through and retry
      }
    }
    if (pinged) {
      // Fetch board identity (HELLO may have arrived proactively; requestHello
      // sends HELLO_REQ and waits for OK with board-info payload if not yet set).
      try {
        await this.proto.requestHello(DEFAULT_TIMEOUT_MS);
        const versionError = protoVersionError(this.proto.protocolVersion);
        if (versionError) throw new Error(versionError);
        useApp.getState().setBoardInfo(this.proto.boardName, this.proto.boardVersion, this.proto.fwVersion);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Unsupported device protocol")) throw e;
        /* other hello failures are non-fatal */
      }

      if (this.transport.setChunkSize && this.supportsKind("MTU_REQ")) {
        // Device queries `_ble_uart.instance().mtu()`, which reflects the last
        // ATT MTU exchange. Peripheral triggers the exchange on connect, but it
        // takes a few conn intervals; a query fired immediately after ping may
        // still see the default 23. Retry once after a short delay if so.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const mtu = await this.proto.mtu(DEFAULT_TIMEOUT_MS);
            if (mtu > 23 || attempt === 1) {
              // ATT MTU includes 3 opcode/handle bytes; usable payload = mtu - 3.
              this.transport.setChunkSize(mtu - 3);
              console.log(`DeviceClient: ATT MTU=${mtu}, chunk=${mtu - 3}`);
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
    if (useApp.getState().editorSettings.bleEchoOverUsb && this.supportsBleEcho) {
      try { await this.setBleEcho(true); } catch { /* non-fatal: echo is a debug aid */ }
    }
    this.pingInterval = setInterval(async () => {
      if (!this.transport.connected || this.pinging || !this.supportsKind("PING")) return;
      this.pinging = true;
      try { await this.proto.ping(DEFAULT_TIMEOUT_MS); } catch { /* ignore; disconnect handler fires on dead link */ }
      finally { this.pinging = false; }
    }, 10_000);
  }

  async disconnect(): Promise<void> {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    // Skip stop if transport never connected — avoids a 3-second waiter timeout
    // when disconnect() is called from the error-cleanup path.
    if (this.transport.connected) {
      // The device can't tell we gave up on a transfer — cancel any active stream.
      if (this.proto.hasActiveStreams() && this.supportsKind("ABORT")) {
        try { await this.proto.abort(undefined, DEFAULT_TIMEOUT_MS); } catch { /* noop */ }
      }
      if (this.supportsKind("STOP")) {
        try { await this.proto.stop(false, DEFAULT_TIMEOUT_MS); } catch { /* noop */ }
      }
      // Echo is device-global state; don't leave it on for the next USB host.
      if (this.bleEcho) {
        try { await this.proto.setBleEcho(false, DEFAULT_TIMEOUT_MS); } catch { /* noop */ }
      }
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
    await this.proto.runProgram(path, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return { stdout, stderr };
  }

  async stop(): Promise<void> {
    await this.proto.stop();
  }

  setProgramEndSink(sink: ProgramEndSink | null): void {
    this.proto.setProgramEndSink(sink);
  }

  setProgramStartSink(sink: ProgramStartSink | null): void {
    this.proto.setProgramStartSink(sink);
  }

  isProgramRunning(): boolean {
    return this.proto.isProgramRunning();
  }

  async readFile(
    path: string,
    opts: { timeoutMs?: number; onProgress?: (sent: number, total: number) => void; signal?: AbortSignal } = {},
  ): Promise<string> {
    const bytes = await this.proto.readFile(path, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.onProgress, opts.signal);
    return new TextDecoder().decode(bytes);
  }

  async readFileRaw(
    path: string,
    opts: { timeoutMs?: number; onProgress?: (sent: number, total: number) => void; signal?: AbortSignal } = {},
  ): Promise<Uint8Array> {
    return this.proto.readFile(path, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.onProgress, opts.signal);
  }

  async upload(path: string, bytes: Uint8Array, opts: UploadRunOptions): Promise<UploadResult> {
    validatePath(path, opts.policy);
    await this.proto.upload(path, bytes, DEFAULT_TIMEOUT_MS, opts.onProgress, opts.signal);
    opts.onProgress?.(bytes.length, bytes.length);
    if (opts.autoRun) {
      await this.proto.runProgram(path);
    }
    return { path, length: bytes.length };
  }

  async ls(path: string, opts: { timeoutMs?: number } = {}): Promise<DirEntry[]> {
    return this.proto.ls(path, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async mv(src: string, dst: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    return this.proto.mv(src, dst, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async cp(src: string, dst: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<void> {
    return this.proto.cp(src, dst, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal);
  }

  async rm(path: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    return this.proto.rm(path, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async mkdir(path: string, opts: { timeoutMs?: number } = {}): Promise<void> {
    return this.proto.mkdir(path, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /** Start an already-uploaded program on the device. */
  async runFile(path: string): Promise<void> {
    await this.proto.runProgram(path);
  }

  addStdoutSink(sink: StdoutSink): () => void {
    return this.proto.addStdoutSink(sink);
  }

  addStderrSink(sink: StderrSink): () => void {
    return this.proto.addStderrSink(sink);
  }

  async exec(code: string): Promise<ExecResult> {
    // stdout/stderr routed to console via permanent sinks installed at connect time
    const reply = await this.proto.exec(code);
    return {
      ok: reply.kind === "OK",
      stdout: "",
      error: reply.kind === "ERR" ? dec.decode(reply.payload) : undefined,
    };
  }

  /** BLE echo is a USB (serial) link feature. */
  get supportsBleEcho(): boolean {
    return this.transport.kind === "serial" && this.supportsKind("ECHO_BLE");
  }

  /**
   * Ask the hub to copy every BLE frame to this USB link (ECHO_BLE). Echoed
   * frames go to the sink set with setEchoSink(). No-op (false) when
   * unsupported. Resolves to the hub's echo state.
   */
  async setBleEcho(enabled: boolean): Promise<boolean> {
    if (!this.supportsBleEcho) return false;
    this.bleEcho = await this.proto.setBleEcho(enabled);
    return this.bleEcho;
  }

  setEchoSink(sink: EchoSink | null): void {
    this.proto.setEchoSink(sink);
  }

  /** REMOTE kind (hub protocol ≥ 1.2): controls for the `remote` module. */
  get supportsRemote(): boolean {
    return this.supportsKind("REMOTE");
  }

  /** Define (or redefine) controls; see HubProtocolV1.remoteDefine(). */
  remoteDefine(defs: RemoteDef[]): Promise<void> {
    return this.proto.remoteDefine(defs);
  }

  /** Send control values (NO_ACK stream unless `ack`). */
  remoteSet(entries: RemoteSetEntry[], opts: { ack?: boolean } = {}): Promise<void> {
    return this.proto.remoteSet(entries, opts);
  }

  /** Remove the given controls, or all of them. */
  remoteClear(ids?: number[]): Promise<void> {
    return this.proto.remoteClear(ids);
  }

  /** Program messages (remote.create_message / remote.send) from the hub. */
  setRemoteSink(sink: RemoteSink | null): void {
    this.proto.setRemoteSink(sink);
  }

  async cmd(cmdId: number, args: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    const payload = new Uint8Array(1 + args.length);
    payload[0] = cmdId;
    payload.set(args, 1);
    const reply = await this.proto.cmd(payload);
    if (reply.kind === "ERR") throw new Error(dec.decode(reply.payload));
    return reply.payload;
  }
}

/** Path web app uses for Run-button uploads. Exposed so UI can display it. */
export function runButtonPath(projectTitle: string, allowRoot: boolean): string {
  const base = sanitizeFilename(projectTitle);
  return (allowRoot ? "/" : "/sd/") + base + ".py";
}
