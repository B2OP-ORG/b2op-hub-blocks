export type TransportKind = "ble" | "serial" | "mock";

export interface TransportInfo {
  name: string;
  mtu?: number;
}

export type DataListener = (chunk: Uint8Array) => void;
export type Unsubscribe = () => void;

export interface Transport {
  readonly kind: TransportKind;
  readonly info: TransportInfo;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(chunk: Uint8Array): Promise<void>;
  onData(cb: DataListener): Unsubscribe;
  onDisconnect(cb: () => void): Unsubscribe;
  /** Optional: set max payload per write. BLE uses this after MTU handshake. */
  setChunkSize?(bytes: number): void;
  /**
   * Optional fast-path write. On BLE this maps to writeValueWithoutResponse
   * (fire-and-forget, multiple writes per conn interval, no per-write ack).
   * Callers must have app-layer integrity checking — silent drops possible
   * on Linux/BlueZ under flow-control edge cases. Falls back to `write` if
   * not implemented.
   */
  writeFast?(chunk: Uint8Array): Promise<void>;
}

export class TransportError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TransportError";
    this.cause = cause;
  }
}
