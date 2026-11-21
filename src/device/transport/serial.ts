import type { DataListener, Transport, TransportInfo, Unsubscribe } from "./types";
import { TransportError } from "./types";

const BAUD = 115200;
const CHUNK = 4096;

export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export class SerialTransport implements Transport {
  readonly kind = "serial" as const;
  info: TransportInfo = { name: "" };
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private dataCbs = new Set<DataListener>();
  private discCbs = new Set<() => void>();
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (!serialSupported()) {
      throw new TransportError("Web Serial not supported in this browser");
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: BAUD });
    this.port = port;
    port.addEventListener("disconnect", this.handleDisconnect);
    const inf = port.getInfo();
    const name = inf.usbVendorId
      ? `USB ${inf.usbVendorId.toString(16)}:${(inf.usbProductId ?? 0).toString(16)}`
      : "Serial device";
    this.info = { name };
    this.writer = port.writable!.getWriter();
    this._connected = true;
    void this.startRead();
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    try { await this.reader?.cancel(); } catch { /* noop */ }
    try { this.reader?.releaseLock(); } catch { /* noop */ }
    try { await this.writer?.close(); } catch { /* noop */ }
    try { this.writer?.releaseLock(); } catch { /* noop */ }
    try { await this.port?.close(); } catch { /* noop */ }
    this.cleanup();
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this.writer) throw new TransportError("Not connected");
    for (let offset = 0; offset < chunk.length; offset += CHUNK) {
      await this.writer.write(chunk.subarray(offset, offset + CHUNK));
    }
  }

  onData(cb: DataListener): Unsubscribe {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onDisconnect(cb: () => void): Unsubscribe {
    this.discCbs.add(cb);
    return () => this.discCbs.delete(cb);
  }

  private async startRead(): Promise<void> {
    if (!this.port?.readable) return;
    this.reader = this.port.readable.getReader();
    try {
      while (this._connected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          for (const cb of this.dataCbs) cb(value);
        }
      }
    } catch {
      // read cancelled or transport error
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
    }
  }

  private handleDisconnect = () => {
    this._connected = false;
    for (const cb of this.discCbs) cb();
  };

  private cleanup() {
    if (this.port) {
      this.port.removeEventListener("disconnect", this.handleDisconnect);
    }
    this.port = null;
    this.reader = null;
    this.writer = null;
  }
}
