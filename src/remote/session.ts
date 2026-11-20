// Remote controller run mode. Lives outside React so the program keeps
// running (and values keep streaming) while the user looks at other tabs.
//
// Start: DEFINE every control of the layout + SET the start values
// (acknowledged), then upload changed files and run main.py. While running,
// changed controls are sent as NO_ACK SETs (sliders / joysticks merged per
// animation frame) and every value is resent every REFRESH_MS: that repairs
// SETs the hub dropped as reordered and keeps remote.age_ms() fresh.
// Stop (back to edit mode): STOP the program and CLEAR the controls.

import { create } from "zustand";
import { useApp } from "../state/store";
import { runProject } from "../project/deviceSync";
import { showAlert, showConfirm } from "../ui/Dialog";
import { remoteDefault, type RemoteEvent, type RemoteType, type RemoteValue } from "../device/protocol";
import { initialValue, layoutSymbols, parseLayout, symbolConflicts, widgetSymbols, type RemoteSymbol } from "./layout";

export const REFRESH_MS = 250;

export interface ProgramMessage { name: string; type: RemoteType; value: RemoteValue; }

interface SessionState {
  /** File id of the layout in run mode, or null (edit mode). */
  fileId: string | null;
  phase: "idle" | "starting" | "running" | "stopping";
  /** Control name → current value. */
  values: Record<string, RemoteValue>;
  /** Program messages from the hub by message id (shown by indicators, matched by name). */
  messages: Record<number, ProgramMessage>;
}

export const useRemoteSession = create<SessionState>(() => ({
  fileId: null,
  phase: "idle",
  values: {},
  messages: {},
}));

/** Value of the program message called `name`, if the program sent one. */
export function messageByName(messages: Record<number, ProgramMessage>, name: string): ProgramMessage | undefined {
  for (const m of Object.values(messages)) if (m.name === name) return m;
  return undefined;
}

// ── Program messages (hub → host) ────────────────────────────────────────────

/** Sink for DeviceClient.setRemoteSink(): keep the message table in sync. */
export function applyRemoteEvent(ev: RemoteEvent): void {
  useRemoteSession.setState((s) => {
    const messages = { ...s.messages };
    if (ev.op === "define") {
      for (const d of ev.defs) messages[d.id] = { name: d.name, type: d.type, value: remoteDefault(d.type) };
    } else if (ev.op === "set") {
      for (const v of ev.values) if (messages[v.id]) messages[v.id] = { ...messages[v.id], value: v.value };
    } else if (ev.ids.length === 0) {
      return { messages: {} };
    } else {
      for (const id of ev.ids) delete messages[id];
    }
    return { messages };
  });
}

// ── Run mode ─────────────────────────────────────────────────────────────────

let controls = new Map<string, RemoteSymbol>();
const pending = new Set<string>();
let frame: number | null = null;
let refresh: ReturnType<typeof setInterval> | null = null;
let unsubApp: (() => void) | null = null;

function entriesFor(names: Iterable<string>) {
  const values = useRemoteSession.getState().values;
  const out = [];
  for (const n of names) {
    const s = controls.get(n);
    if (s) out.push({ id: s.id, type: s.type, value: values[n] ?? remoteDefault(s.type) });
  }
  return out;
}

function send(names: Iterable<string>): void {
  const device = useApp.getState().device;
  const entries = entriesFor(names);
  if (!device || !entries.length) return;
  device.remoteSet(entries).catch((e) => console.warn("[remote] SET failed", e));
}

function flush(): void {
  if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
  if (!pending.size) return;
  const names = [...pending];
  pending.clear();
  send(names);
}

/**
 * Set a control's value in run mode. `merge` (sliders, joysticks) sends once
 * per animation frame; otherwise it goes out now (a button press + release in
 * the same frame must both reach the hub).
 */
export function setControl(name: string, value: RemoteValue, merge = false): void {
  const s = useRemoteSession.getState();
  if (s.phase !== "running" && s.phase !== "starting") return;
  if (s.values[name] === value) return;
  useRemoteSession.setState({ values: { ...s.values, [name]: value } });
  if (s.phase !== "running") return; // start values go out with the DEFINE
  pending.add(name);
  if (!merge) flush();
  else if (frame === null) frame = requestAnimationFrame(() => { frame = null; flush(); });
}

function stopTimers(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  pending.clear();
  if (refresh !== null) clearInterval(refresh);
  refresh = null;
  unsubApp?.();
  unsubApp = null;
}

/** Back to edit mode after the program ended on its own or the hub went away. */
function ended(reason: string): void {
  if (useRemoteSession.getState().phase === "idle") return;
  stopTimers();
  const device = useApp.getState().device;
  if (device) device.remoteClear().catch(() => { /* hub gone or busy: values reset on disconnect anyway */ });
  useRemoteSession.setState({ fileId: null, phase: "idle" });
  useApp.getState().appendConsole("info", `[remote controller: ${reason}]\n`);
}

/** Enter run mode for layout file `fileId`. Resolves to whether the program started. */
export async function startRemote(fileId: string): Promise<boolean> {
  const st = useApp.getState();
  if (useRemoteSession.getState().phase !== "idle") return false;
  const file = st.mfp.files.find((f) => f.id === fileId);
  if (!file) return false;
  const device = st.device;
  if (!device) {
    await showAlert("No hub connected", "Connect a hub to run the remote controller.");
    return false;
  }
  if (!device.supportsRemote) {
    await showAlert("Firmware too old", "The remote controller needs hub firmware with protocol 1.2 or newer. Please update the hub firmware.");
    return false;
  }
  let syms: RemoteSymbol[];
  let layout;
  try {
    layout = parseLayout(file.content);
    syms = layoutSymbols(layout, file.name);
  } catch (e) {
    await showAlert("Broken layout", (e as Error).message);
    return false;
  }
  const conflicts = symbolConflicts(syms);
  if (conflicts.names.size || conflicts.ids.size) {
    await showAlert("Fix the layout first", "Two widgets use the same name or id. Select the widgets marked in red and change them.");
    return false;
  }
  if (st.running) {
    if (!await showConfirm("Program running", "A program is running on the hub. Stop it and start main.py?", { confirmLabel: "Stop and run" })) return false;
    try { await device.stop(); } catch { /* ignore: RUN reports "busy" if it is still running */ }
  }

  const ctrl = syms.filter((s) => s.role === "control");
  controls = new Map(ctrl.map((s) => [s.name, s]));
  const values: Record<string, RemoteValue> = {};
  for (const w of layout.widgets) {
    for (const s of widgetSymbols(w, file.name)) if (s.role === "control") values[s.name] = initialValue(s, w);
  }
  useRemoteSession.setState({ fileId, phase: "starting", values });

  try {
    await device.remoteClear();
    if (ctrl.length) {
      await device.remoteDefine(ctrl.map((s) => ({ id: s.id, type: s.type, name: s.name })));
      await device.remoteSet(entriesFor(controls.keys()), { ack: true });
    }
  } catch (e) {
    useRemoteSession.setState({ fileId: null, phase: "idle" });
    await showAlert("Remote controller failed", (e as Error).message);
    return false;
  }

  const started = await runProject();
  if (!started || useRemoteSession.getState().phase !== "starting") {
    ended("not started");
    return false;
  }
  // Values changed while starting go out now; then the periodic refresh.
  useRemoteSession.setState({ phase: "running" });
  send(controls.keys());
  refresh = setInterval(() => send(controls.keys()), REFRESH_MS);
  unsubApp = useApp.subscribe((s, prev) => {
    if (!s.device) ended("hub disconnected");
    else if (prev.running && !s.running) ended("program ended");
  });
  if (!useApp.getState().running) ended("program ended");
  return true;
}

/** Leave run mode (edit mode): stop the program and clear the controls. */
export async function stopRemote(): Promise<void> {
  const s = useRemoteSession.getState();
  if (s.phase === "idle" || s.phase === "stopping") return;
  useRemoteSession.setState({ phase: "stopping" });
  stopTimers();
  const { device, running, setRunning, appendConsole } = useApp.getState();
  if (device) {
    if (running) {
      try {
        await device.stop();
        setRunning(false);
        appendConsole("info", "[stop]\n");
      } catch (e) {
        appendConsole("err", `[stop failed: ${(e as Error).message}]\n`);
      }
    }
    try { await device.remoteClear(); } catch { /* ignore */ }
  }
  useRemoteSession.setState({ fileId: null, phase: "idle" });
}
