import { useState } from "react";
import { BleTransport } from "../../device/transport/ble";
import { SerialTransport } from "../../device/transport/serial";
import { MockTransport } from "../../device/sim/mockHub";
import { DeviceClient } from "../../device/deviceClient";
import { formatEchoFrame } from "../../device/protocol";
import { useApp } from "../../state/store";
import { saveLastDeviceName } from "../../settings/storage";
import { applyRemoteEvent } from "../../remote/session";

export type ConnectKind = "ble" | "serial" | "mock";

/** Connect / disconnect / stop the hub, wiring the client's sinks into the store. */
export function useDeviceConnection() {
  const device = useApp((s) => s.device);
  const setDevice = useApp((s) => s.setDevice);
  const setConnection = useApp((s) => s.setConnection);
  const setRunning = useApp((s) => s.setRunning);
  const setDeviceName = useApp((s) => s.setDeviceName);
  const appendConsole = useApp((s) => s.appendConsole);
  const [connBusy, setConnBusy] = useState(false);

  const connect = async (kind: ConnectKind) => {
    setConnBusy(true);
    setConnection("connecting");
    let client: DeviceClient | null = null;
    try {
      const transport =
        kind === "ble" ? new BleTransport()
        : kind === "serial" ? new SerialTransport()
        : new MockTransport();
      client = new DeviceClient(transport, {
        onBoardInfo: (name, version, fw) => useApp.getState().setBoardInfo(name, version, fw),
        bleEchoOverUsb: () => useApp.getState().editorSettings.bleEchoOverUsb,
      });
      transport.onDisconnect(() => {
        setConnection("disconnected");
        setDevice(null);
        setRunning(false);
        applyRemoteEvent({ op: "clear", ids: [] });
        appendConsole("info", "[device disconnected]\n");
      });
      // Sinks must be registered before connect() so PROG_START/END frames
      // that arrive during the handshake (ping/hello/mtu) are not dropped.
      client.setProgramEndSink((info) => {
        setRunning(false);
        appendConsole(info.ok ? "info" : "err", `[program ${info.ok ? "ended" : "error"}${info.message ? ": " + info.message : ""}]\n`);
      });
      client.setProgramStartSink((info) => {
        setRunning(true);
        appendConsole("info", `[program running: ${info.path}]\n`);
      });
      client.addStdoutSink((t) => appendConsole("out", t));
      client.addStderrSink((t) => appendConsole("err", t));
      client.setEchoSink((f) => appendConsole("info", formatEchoFrame(f) + "\n"));
      client.setRemoteSink(applyRemoteEvent);
      await client.connect();
      setDevice(client);
      setConnection("connected");
      setRunning(client.isProgramRunning());
      saveLastDeviceName(transport.info.name);
      setDeviceName(transport.info.name);
      appendConsole("info", `[connected: ${transport.info.name}]\n`);
    } catch (e) {
      setConnection("error", (e as Error).message);
      appendConsole("err", `[connect failed: ${(e as Error).message}]\n`);
      if (client) { try { await client.disconnect(); } catch { /* noop */ } }
    } finally {
      setConnBusy(false);
    }
  };

  const disconnect = async () => {
    if (!device) return;
    setConnBusy(true);
    try {
      await device.disconnect();
      applyRemoteEvent({ op: "clear", ids: [] });
      setDevice(null);
      setConnection("disconnected");
      setRunning(false);
    } finally {
      setConnBusy(false);
    }
  };

  const stop = async () => {
    if (!device) return;
    setConnBusy(true);
    try {
      await device.stop();
      setRunning(false);
      appendConsole("info", "[stop]\n");
    } catch (e) {
      appendConsole("err", `[stop failed: ${(e as Error).message}]\n`);
    } finally {
      setConnBusy(false);
    }
  };

  return { connBusy, connect, disconnect, stop };
}
