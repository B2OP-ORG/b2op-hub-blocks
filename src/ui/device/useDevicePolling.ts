import { useEffect, useRef } from "react";
import { useApp } from "../../state/store";
import { CmdId, ParseReply } from "../../device/cmdHelpers";
import type { DeviceClient } from "../../device/deviceClient";
import { PORTS } from "./deviceInfo";

/**
 * While live mode is on, poll the hub every ~100 ms into the store: buttons and
 * orientation each round, port types (once) + values every 2nd, battery every 20th.
 */
export function useDevicePolling(device: DeviceClient | null, liveMode: boolean) {
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
    const queried = queriedTypes.current;

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
          if (!queried.has(name)) {
            try {
              const data = await device.cmd(CmdId.PORT_GET_DEVICE_TYPE, new Uint8Array([idx]));
              if (alive) setDeviceType(name, ParseReply.portGetDeviceType(data));
            } catch { /* ignore */ }
            queried.add(name);
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
      queried.clear();
    };
  }, [device, liveMode, setBattery, setButtonState, setOrientation, setSensorValue, setDeviceType]);
}
