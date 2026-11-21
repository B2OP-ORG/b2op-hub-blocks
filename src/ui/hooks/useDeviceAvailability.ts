import { useApp } from "../../state/store";

/** Whether device actions (upload / run) are possible now, and why not. */
export function useDeviceAvailability(): { canDevice: boolean; deviceHint: string | undefined } {
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);
  return {
    canDevice: !!device && !running,
    deviceHint: !device ? "connect a hub" : running ? "program running" : undefined,
  };
}
