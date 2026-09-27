import type { DataListener, Transport, TransportInfo, Unsubscribe } from "./types";
import { TransportError } from "./types";

export const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // host -> device (write)
export const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // device -> host (notify)

// Safe chunk = ATT MTU (23) - 3 opcode/handle bytes. Upgraded via
// setChunkSize() after the app-level MTU handshake in HubProtocol.
const DEFAULT_CHUNK = 20;
const MIN_CHUNK = 20;
const MAX_CHUNK = 512;

export function bleSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class BleTransport implements Transport {
  readonly kind = "ble" as const;
  info: TransportInfo = { name: "" };
  private device: BluetoothDevice | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;
  private dataCbs = new Set<DataListener>();
  private discCbs = new Set<() => void>();
  private writeQueue: Promise<void> = Promise.resolve();
  private writeAbortSignal: { aborted: boolean } | null = null;
  private writeCount = 0;
  private chunkSize = DEFAULT_CHUNK;

  setChunkSize(bytes: number): void {
    if (!Number.isFinite(bytes)) return;
    this.chunkSize = Math.max(MIN_CHUNK, Math.min(bytes | 0, MAX_CHUNK));
    this.info = { ...this.info, mtu: this.chunkSize + 3 };
  }

  get connected(): boolean {
    return this.device?.gatt?.connected === true;
  }

  async connect(): Promise<void> {
    if (!bleSupported()) {
      throw new TransportError("Web Bluetooth not supported in this browser");
    }
    // Linux BlueZ often drops the NUS service UUID from surfaced advertisement
    // data, so a services-only filter hides the device. Use name-based filters
    // and let optionalServices unlock the actual GATT service on connect.
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        // { services: [NUS_SERVICE] },
        { namePrefix: "B2OP" },
        { namePrefix: "Hub" },
      ],
      optionalServices: [NUS_SERVICE],
    });
    this.device = device;
    this.info = { name: device.name ?? "BLE device" };

    // Retry GATT setup once. BlueZ caches stale GATT handles after a peripheral
    // power cycle; the first attempt clears the cache, the second succeeds.
    // The disconnect listener is intentionally added only after successful setup
    // so a gatt.disconnect() during the retry doesn't fire UI callbacks.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const server = await device.gatt!.connect();
        const service = await server.getPrimaryService(NUS_SERVICE);
        this.rxChar = await service.getCharacteristic(NUS_RX);
        this.txChar = await service.getCharacteristic(NUS_TX);
        this.txChar.addEventListener("characteristicvaluechanged", this.handleNotify);
        await this.txChar.startNotifications();
        device.addEventListener("gattserverdisconnected", this.handleDisconnect);
        return;
      } catch (e) {
        lastError = e;
        if (this.txChar) {
          this.txChar.removeEventListener("characteristicvaluechanged", this.handleNotify);
          this.txChar = null;
        }
        this.rxChar = null;
        if (device.gatt?.connected) device.gatt.disconnect();
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw lastError;
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.cleanup();
  }

  abort(): void {
    if (this.writeAbortSignal) this.writeAbortSignal.aborted = true;
  }

  write(chunk: Uint8Array): Promise<void> {
    return this.doWrite(chunk, /*fast=*/ false);
  }

  writeFast(chunk: Uint8Array): Promise<void> {
    return this.doWrite(chunk, /*fast=*/ true);
  }

  private doWrite(chunk: Uint8Array, fast: boolean): Promise<void> {
    if (!this.rxChar) throw new TransportError("Not connected");
    const rx = this.rxChar;
    // Each call gets a fresh abort signal; abort() sets the current one.
    const abortSignal: { aborted: boolean } = { aborted: false };
    this.writeAbortSignal = abortSignal;
    let result: Promise<void> = this.writeQueue;
    for (let offset = 0; offset < chunk.length; offset += this.chunkSize) {
      const slice = chunk.subarray(offset, offset + this.chunkSize);
      const step = result.then(async () => {
        if (abortSignal.aborted) throw new Error("aborted");
        this.writeCount++;
        const buf = new Uint8Array(slice.byteLength);
        buf.set(slice);
        try {
          if (fast) {
            await rx.writeValueWithoutResponse(buf);
          } else {
            await rx.writeValueWithResponse(buf);
          }
        } catch (e) {
          console.error("[ble] write failed at offset", offset, "len", slice.byteLength, "fast=", fast, e);
          throw e;
        }
      });
      // writeQueue advances even on error so future writes aren't silently dropped.
      this.writeQueue = step.catch(() => {});
      result = step;
    }
    return result;
  }

  onData(cb: DataListener): Unsubscribe {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onDisconnect(cb: () => void): Unsubscribe {
    this.discCbs.add(cb);
    return () => this.discCbs.delete(cb);
  }

  private handleNotify = (ev: Event) => {
    const target = ev.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.emit(bytes);
  };

  private emit(bytes: Uint8Array) {
    for (const cb of this.dataCbs) cb(bytes);
  }

  private handleDisconnect = () => {
    for (const cb of this.discCbs) cb();
  };

  private cleanup() {
    if (this.device) {
      this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    }
    if (this.txChar) {
      this.txChar.removeEventListener("characteristicvaluechanged", this.handleNotify);
    }
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
    this.chunkSize = DEFAULT_CHUNK;
  }
}
