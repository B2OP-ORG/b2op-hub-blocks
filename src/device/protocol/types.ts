import type { RemoteDef, RemoteSetEntry, RemoteSink } from "./remote";

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

/** A BLE frame the hub copied to USB (ECHO_BLE on). */
export interface EchoFrame {
  /** "rx" = host→hub request received over BLE, "tx" = hub→host frame sent over BLE. */
  direction: "rx" | "tx";
  seq: number;
  /** FLAGS as sent on BLE (echo bits removed). */
  flags: number;
  kind: number;
  payload: Uint8Array;
}
export type EchoSink = (frame: EchoFrame) => void;

export interface FrameReply {
  kind: "OK" | "ERR" | "DATA";
  /** Raw payload bytes. Decode to text with TextDecoder if needed. */
  payload: Uint8Array;
}

export interface DirEntry { name: string; isDir: boolean; }

/** A transfer stopped by the caller's AbortSignal, after the device confirmed it. */
export class CancelledError extends Error {
  constructor() { super("Cancelled"); this.name = "CancelledError"; }
}

/** Every request times out after this long without hearing from the device. */
export const DEFAULT_TIMEOUT_MS = 3000;

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
  /** Receives BLE frames echoed over USB; they never reach waiters or stdout sinks. */
  setEchoSink(sink: EchoSink | null): void;
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
  /** `signal` aborts: sends ABORT and rejects with CancelledError once the device confirms. */
  upload(path: string, bytes: Uint8Array, idleTimeoutMs?: number, onProgress?: ProgressSink, signal?: AbortSignal): Promise<void>;
  readFile(path: string, timeoutMs?: number, onProgress?: ProgressSink, signal?: AbortSignal): Promise<Uint8Array>;
  ls(path: string, timeoutMs?: number): Promise<DirEntry[]>;
  mv(src: string, dst: string, timeoutMs?: number): Promise<void>;
  cp(src: string, dst: string, timeoutMs?: number, signal?: AbortSignal): Promise<void>;
  rm(path: string, timeoutMs?: number): Promise<void>;
  mkdir(path: string, timeoutMs?: number): Promise<void>;
  /** Cancel the UPLOAD / READ / CP started with `targetSeq` (omit = all streams). */
  abort(targetSeq?: number, timeoutMs?: number): Promise<void>;
  /** Execute Python source in REPL mode on device. STDOUT arrives via stdout sinks. */
  exec(code: string, timeoutMs?: number): Promise<FrameReply>;
  /** Send a binary CMD frame. Reply is KIND_OK or KIND_DATA. */
  cmd(payload: Uint8Array, timeoutMs?: number): Promise<FrameReply>;
  /** ECHO_BLE (USB only): switch the BLE echo; resolves to the new state. */
  setBleEcho(enabled: boolean, timeoutMs?: number): Promise<boolean>;
  /** REMOTE DEFINE (acknowledged; split into several frames if needed). */
  remoteDefine(defs: RemoteDef[], timeoutMs?: number): Promise<void>;
  /**
   * REMOTE SET. Default: streamed with FLAGS NO_ACK (resolves once queued);
   * `ack` waits for OK. Each frame applies atomically on the device.
   */
  remoteSet(entries: RemoteSetEntry[], opts?: { ack?: boolean; timeoutMs?: number }): Promise<void>;
  /** REMOTE CLEAR: the given control ids, or all when omitted / empty. */
  remoteClear(ids?: number[], timeoutMs?: number): Promise<void>;
  /** Receives program messages and program-set control values (unsolicited REMOTE frames). */
  setRemoteSink(sink: RemoteSink | null): void;
}
