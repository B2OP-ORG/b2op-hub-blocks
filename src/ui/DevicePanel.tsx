import { useEffect, useRef } from "react";
import { useApp } from "../state/store";
import { CmdId, ParseReply, PORT_IDX, type PortIdx } from "../device/cmdHelpers";

const PORTS: Array<{ name: string; idx: PortIdx }> = [
  { name: "A", idx: PORT_IDX.A },
  { name: "B", idx: PORT_IDX.B },
  { name: "C", idx: PORT_IDX.C },
  { name: "D", idx: PORT_IDX.D },
  { name: "E", idx: PORT_IDX.E },
  { name: "F", idx: PORT_IDX.F },
  { name: "LED", idx: PORT_IDX.LED },
  { name: "Accel", idx: PORT_IDX.Accel },
  { name: "Gyro", idx: PORT_IDX.Gyro },
];

const MOTORS = new Set([1, 2, 38, 39, 41, 46, 47, 48, 49, 75, 76, 100, 101]);
const SENSORS = new Set([37, 43, 61, 62, 63]);
const IMU = new Set([57, 58, 59, 40, 54]);

const DEVICE_NAMES: Record<number, string> = {
  1: "Simple Motor", 2: "Train Motor", 8: "Light",
  20: "Voltage", 21: "Current", 22: "Buzzer", 23: "Hub LED",
  34: "Tilt", 35: "Motion", 37: "Color+Dist",
  38: "Med Motor", 39: "MoveHub Motor", 40: "MoveHub Tilt",
  41: "Duplo Motor", 46: "L Linear", 47: "XL Linear",
  48: "Med Angular", 49: "L Angular", 54: "Gesture",
  55: "Remote Btn", 56: "Remote RSSI", 57: "Accel", 58: "Gyro",
  59: "Tilt", 60: "Temp", 61: "Color", 62: "Distance",
  63: "Force", 75: "Med Angular (G)", 76: "L Angular (G)",
  100: "EV3 Med", 101: "EV3 Large",
};

function portColor(type: number): string {
  if (!type) return "#3a5a64";
  if (MOTORS.has(type)) return "#60a5fa";
  if (SENSORS.has(type)) return "#4ade80";
  if (type === 23) return "#fbbf24";
  if (IMU.has(type)) return "#67e8f9";
  return "#dff5fb";
}

function batteryColor(pct: number): string {
  const hue = Math.round((pct / 100) * 120);
  return `hsl(${hue}, 85%, 48%)`;
}

const BASE: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};

export function DevicePanel() {
  const device = useApp((s) => s.device);
  const liveMode = useApp((s) => s.project.settings.liveMode);
  const setDevicePanelOpen = useApp((s) => s.setDevicePanelOpen);
  const batteryMv = useApp((s) => s.batteryMv);
  const batteryPct = useApp((s) => s.batteryPct);
  const buttonState = useApp((s) => s.buttonState);
  const orientation = useApp((s) => s.orientation);
  const sensorValues = useApp((s) => s.sensorValues);
  const deviceType = useApp((s) => s.deviceType);
  const setBattery = useApp((s) => s.setBattery);
  const setButtonState = useApp((s) => s.setButtonState);
  const setOrientation = useApp((s) => s.setOrientation);
  const setSensorValue = useApp((s) => s.setSensorValue);
  const setDeviceType = useApp((s) => s.setDeviceType);

  const queriedTypes = useRef(new Set<string>());

  useEffect(() => {
    if (!device || !liveMode) return;

    let alive = true;
    let tick = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!alive || !device) return;

      try {
        const btns = await device.cmd(CmdId.HUB_GET_BUTTONS);
        if (alive) setButtonState(ParseReply.hubGetButtons(btns));
      } catch { /* ignore */ }

      if (!alive) return;

      try {
        const ori = await device.cmd(CmdId.HUB_GET_ORIENTATION);
        if (alive) setOrientation(ParseReply.hubGetOrientation(ori));
      } catch { /* ignore */ }

      if (tick % 2 === 0) {
        for (const { name, idx } of PORTS) {
          if (!alive) break;
          if (!queriedTypes.current.has(name)) {
            try {
              const data = await device.cmd(CmdId.PORT_GET_DEVICE_TYPE, new Uint8Array([idx]));
              if (alive) setDeviceType(name, ParseReply.portGetDeviceType(data));
            } catch { /* ignore */ }
            queriedTypes.current.add(name);
          }
          const type = useApp.getState().deviceType[name];
          if (type && type !== 0) {
            try {
              const data = await device.cmd(CmdId.PORT_GET_VALUE, new Uint8Array([idx, 0, 0]));
              if (alive) setSensorValue(name, ParseReply.portGetValue(data).filter(isFinite));
            } catch { /* ignore */ }
          }
          if (!alive) break;
        }
      }

      if (tick % 20 === 0) {
        if (!alive) return;
        try {
          const data = await device.cmd(CmdId.HUB_GET_BATTERY);
          if (alive) {
            const b = ParseReply.hubGetBattery(data);
            setBattery(b.mv, b.pct);
          }
        } catch { /* ignore */ }
      }

      tick++;
    }

    async function loop() {
      await poll();
      if (alive) timer = setTimeout(loop, 100);
    }

    void loop();

    return () => {
      alive = false;
      clearTimeout(timer);
      queriedTypes.current.clear();
    };
  }, [device, liveMode, setBattery, setButtonState, setOrientation, setSensorValue, setDeviceType]);

  const battV = (batteryMv / 1000).toFixed(2);
  const bColor = batteryColor(batteryPct);

  return (
    <div style={{
      ...BASE,
      position: "fixed", top: 0, right: 0, bottom: 0, width: 300,
      background: "#071018", borderLeft: "1px solid #0e7490",
      color: "#dff5fb", display: "flex", flexDirection: "column", zIndex: 200,
    }}>
      {/* Header */}
      <div style={{
        padding: "6px 12px", background: "#0b3b48", borderBottom: "1px solid #0e7490",
        display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700,
      }}>
        <span>Device</span>
        <button type="button" onClick={() => setDevicePanelOpen(false)} style={{
          background: "transparent", color: "#dff5fb", border: "1px solid #0e7490",
          padding: "2px 8px", cursor: "pointer", borderRadius: 4, fontWeight: 600, fontSize: 12,
        }}>✕</button>
      </div>

      {!device && (
        <div style={{ padding: 12, color: "#4a7080" }}>No device connected</div>
      )}

      {device && !liveMode && (
        <div style={{ padding: 12, color: "#4a7080" }}>Enable live mode to poll device</div>
      )}

      {device && liveMode && (
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Battery */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #132a34" }}>
            <div style={{ color: "#4cc3ff", marginBottom: 6, fontWeight: 600 }}>Battery</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
              <span style={{ color: "#a0d8e8" }}>{battV} V</span>
              <span style={{ color: bColor, fontWeight: 700 }}>{batteryPct}%</span>
            </div>
            {/* Slider track */}
            <div style={{ position: "relative", height: 8, background: "#132a34", borderRadius: 4 }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${batteryPct}%`,
                background: `linear-gradient(to right, hsl(0,85%,40%), ${bColor})`,
                borderRadius: 4,
                transition: "width 0.5s ease, background 0.5s ease",
              }} />
              <div style={{
                position: "absolute", top: "50%",
                left: `calc(${batteryPct}% - 6px)`,
                transform: "translateY(-50%)",
                width: 12, height: 12, borderRadius: "50%",
                background: bColor,
                boxShadow: `0 0 8px ${bColor}`,
                transition: "left 0.5s ease, background 0.5s ease, box-shadow 0.5s ease",
              }} />
            </div>
          </div>

          {/* Buttons */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #132a34" }}>
            <div style={{ color: "#4cc3ff", marginBottom: 8, fontWeight: 600 }}>Buttons</div>
            {/* D-pad layout: center on its own row, then up/down/left/right in cross */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <Btn label="center" pressed={!!buttonState["center"]} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, width: 120 }}>
                <div />
                <Btn label="up" pressed={!!buttonState["up"]} />
                <div />
                <Btn label="left" pressed={!!buttonState["left"]} />
                <div />
                <Btn label="right" pressed={!!buttonState["right"]} />
                <div />
                <Btn label="down" pressed={!!buttonState["down"]} />
                <div />
              </div>
            </div>
          </div>

          {/* Orientation */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #132a34" }}>
            <div style={{ color: "#4cc3ff", marginBottom: 6, fontWeight: 600 }}>Orientation</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <AxisVal label="P" value={orientation.pitch} color="#f97316" />
              <AxisVal label="Y" value={orientation.yaw}   color="#a855f7" />
              <AxisVal label="R" value={orientation.roll}  color="#22c55e" />
            </div>
          </div>

          {/* Ports */}
          <div style={{ padding: "10px 12px" }}>
            <div style={{ color: "#4cc3ff", marginBottom: 8, fontWeight: 600 }}>Ports</div>
            {PORTS.map(({ name }) => {
              const vals = sensorValues[name];
              const type = deviceType[name];
              const connected = type !== undefined && type !== 0;
              const color = portColor(type ?? 0);
              const label = connected ? (DEVICE_NAMES[type] ?? `0x${type.toString(16).padStart(4, "0")}`) : "(—)";
              return (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "baseline" }}>
                  <span style={{ color: "#4cc3ff", minWidth: 38, fontWeight: 600 }}>{name}</span>
                  <span style={{ color, flex: 1, marginLeft: 6, fontSize: 11 }}>{label}</span>
                  <span style={{ color: "#a0d8e8", textAlign: "right", fontSize: 11 }}>
                    {vals && vals.length > 0
                      ? vals.length === 1
                        ? vals[0].toFixed(1)
                        : `[${vals.map((v) => v.toFixed(1)).join(", ")}]`
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ label, pressed }: { label: string; pressed: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      cursor: "default", userSelect: "none",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: pressed ? "#4cc3ff" : "#1a3540",
        boxShadow: pressed ? "0 0 8px #4cc3ff80" : "none",
        border: `1px solid ${pressed ? "#4cc3ff" : "#2a5060"}`,
        transition: "background 0.1s, box-shadow 0.1s",
      }} />
      <span style={{ fontSize: 9, color: pressed ? "#dff5fb" : "#3a5a64", letterSpacing: 0.5 }}>
        {label}
      </span>
    </div>
  );
}

function AxisVal({ label, value, color }: { label: string; value: number; color: string }) {
  const bold = Math.abs(value) > 45;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ color, fontSize: 10, fontWeight: 700 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400, fontSize: 13 }}>{value.toFixed(1)}°</span>
    </div>
  );
}
