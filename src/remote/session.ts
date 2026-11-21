// Remote controller run mode. Follows the hub's program state: whenever a
// program runs, every controller of the project is live; when it ends, the
// controllers go back to edit mode. Lives outside React so values keep
// streaming while the user looks at other tabs.
//
// Controls and program messages share one id space on the hub. The program
// may set a control (remote.send with the control's id): the hub sends that
// SET up and the control here takes the value (the slider moves), which the
// periodic refresh then keeps sending.
//
// Start (editor runs a program): before RUN, DEFINE every control of the
// project's layouts + SET the start values (acknowledged), so the program sees
// them from its first line. A program started some other way (hub menu, a
// program already running on connect) gets the same DEFINE + SET as soon as it
// is seen running. While running, changed controls are sent as NO_ACK SETs
// (sliders / joysticks merged per animation frame) and every value is resent
// every REFRESH_MS: that repairs SETs the hub dropped as reordered and keeps
// remote.age_ms() fresh. End (program ended / stopped / hub gone): CLEAR the
// controls. A reload keeps the session (and the control values) across the
// stop and restart instead of going back to edit mode in between.

import { create } from "zustand";
import { useApp } from "../state/store";
import { isReloading, setBeforeRunHook, setReloadEndHook } from "../run/deviceSync";
import { remoteDefault, type RemoteEvent, type RemoteType, type RemoteValue } from "../device/protocol";
import { initialValue, isRemoteFile, symbolConflicts, tryParseLayout, widgetSymbols, type RemoteSymbol } from "./layout";

export const REFRESH_MS = 250;

export interface ProgramMessage { name: string; type: RemoteType; value: RemoteValue; }

interface SessionState {
  /** idle = edit mode; otherwise a program runs and the controllers are live. */
  phase: "idle" | "starting" | "running";
  /** Control name → current value. */
  values: Record<string, RemoteValue>;
  /** Program messages from the hub by message id (shown by indicators, matched by name). */
  messages: Record<number, ProgramMessage>;
}

export const useRemoteSession = create<SessionState>(() => ({
  phase: "idle",
  values: {},
  messages: {},
}));

/** Value of the program message called `name`, if the program sent one. */
export function messageByName(messages: Record<number, ProgramMessage>, name: string): ProgramMessage | undefined {
  for (const m of Object.values(messages)) if (m.name === name) return m;
  return undefined;
}

// ── Program messages + program-set controls (hub → host) ─────────────────────

/** Live control (run mode) with protocol id `id`. */
function controlById(id: number): RemoteSymbol | undefined {
  if (useRemoteSession.getState().phase === "idle") return undefined;
  for (const c of controls.values()) if (c.id === id) return c;
  return undefined;
}

/** Sink for DeviceClient.setRemoteSink(): keep the message table (and program-set controls) in sync. */
export function applyRemoteEvent(ev: RemoteEvent): void {
  useRemoteSession.setState((s) => {
    const messages = { ...s.messages };
    if (ev.op === "define") {
      for (const d of ev.defs) messages[d.id] = { name: d.name, type: d.type, value: remoteDefault(d.type) };
    } else if (ev.op === "set") {
      let values: Record<string, RemoteValue> | null = null;
      for (const v of ev.values) {
        const c = controlById(v.id);
        if (c) (values ??= { ...s.values })[c.name] = v.value;
        else if (messages[v.id]) messages[v.id] = { ...messages[v.id], value: v.value };
      }
      return values ? { messages, values } : { messages };
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
/** Bumped by every start / end, so a slow start that was overtaken drops its result. */
let generation = 0;

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
  if (s.phase === "idle") return;
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
}

/** The project's controls and their start values. Throws with a user-facing message on duplicate names / ids. */
function projectControls(): { syms: RemoteSymbol[]; values: Record<string, RemoteValue> } {
  const syms: RemoteSymbol[] = [];
  const values: Record<string, RemoteValue> = {};
  for (const f of useApp.getState().mfp.files) {
    if (!isRemoteFile(f.name)) continue;
    const layout = tryParseLayout(f.content);
    if (!layout) continue;
    for (const w of layout.widgets) {
      for (const s of widgetSymbols(w, f.name)) {
        syms.push(s);
        if (s.role === "control") values[s.name] = initialValue(s, w);
      }
    }
  }
  const conflicts = symbolConflicts(syms);
  if (conflicts.names.size || conflicts.ids.size) {
    throw new Error("Two remote controller widgets use the same name or id. Open the controller, select the widgets marked in red and change them.");
  }
  return { syms: syms.filter((s) => s.role === "control"), values };
}

/** Whether the project has a remote controller layout (otherwise nothing is set up). */
function hasLayouts(): boolean {
  return useApp.getState().mfp.files.some((f) => isRemoteFile(f.name));
}

/**
 * DEFINE the project's controls and SET their start values (phase "starting").
 * Resolves to false when there is nothing to set up or this start was overtaken.
 */
async function define(): Promise<boolean> {
  const device = useApp.getState().device;
  if (!device || !hasLayouts()) { toIdle(); return false; }
  if (!device.supportsRemote) {
    toIdle();
    useApp.getState().appendConsole("info", "[remote controller: needs hub firmware with protocol 1.2 or newer]\n");
    return false;
  }
  let syms: RemoteSymbol[], values: Record<string, RemoteValue>;
  try {
    ({ syms, values } = projectControls());
  } catch (e) {
    toIdle();
    throw e;
  }
  // Reload: controls that still exist with the same kind of value keep it.
  if (isReloading()) {
    const prev = useRemoteSession.getState().values;
    for (const name of Object.keys(values)) {
      if (name in prev && typeof prev[name] === typeof values[name]) values[name] = prev[name];
    }
  }
  const gen = ++generation;
  stopTimers();
  controls = new Map(syms.map((s) => [s.name, s]));
  useRemoteSession.setState({ phase: "starting", values });
  try {
    await device.remoteClear();
    if (syms.length) {
      await device.remoteDefine(syms.map((s) => ({ id: s.id, type: s.type, name: s.name })));
      await device.remoteSet(entriesFor(controls.keys()), { ack: true });
    }
  } catch (e) {
    if (gen === generation) {
      ++generation;
      useRemoteSession.setState({ phase: "idle" });
    }
    throw e;
  }
  return gen === generation;
}

/** The program is running: send everything changed while starting, then refresh periodically. */
function stream(): void {
  if (useRemoteSession.getState().phase !== "starting") return;
  useRemoteSession.setState({ phase: "running" });
  send(controls.keys());
  refresh = setInterval(() => send(controls.keys()), REFRESH_MS);
}

/** Drop a session that never got going (nothing to set up, or a reload whose restart failed). */
function toIdle(): void {
  if (useRemoteSession.getState().phase === "idle") return;
  ++generation;
  stopTimers();
  useRemoteSession.setState({ phase: "idle" });
}

/**
 * The program ended or the hub went away: back to edit mode. During a reload
 * the session waits in "starting" for the restart instead (values kept,
 * control changes go out with the next DEFINE).
 */
function ended(reason: string): void {
  ++generation;
  if (useRemoteSession.getState().phase === "idle") return;
  stopTimers();
  const device = useApp.getState().device;
  if (device) device.remoteClear().catch(() => { /* hub gone or busy: values reset on disconnect anyway */ });
  if (device && isReloading()) {
    useRemoteSession.setState({ phase: "starting" });
    return;
  }
  useRemoteSession.setState({ phase: "idle" });
  useApp.getState().appendConsole("info", `[remote controller: ${reason}]\n`);
}

/** A program was seen running that the editor didn't set up (hub menu, running on connect). */
async function attachLate(): Promise<void> {
  try {
    if (await define() && useApp.getState().running) stream();
  } catch (e) {
    useApp.getState().appendConsole("err", `[remote controller: ${(e as Error).message}]\n`);
  }
}

let started = false;
/** The before-run hook already set up (or skipped) this run: don't attach late. */
let prepared = false;

/** Follow the hub's program state. Idempotent. */
export function startRemoteSession(): void {
  if (started) return;
  started = true;
  // Before the editor runs a program: set up the controls (errors abort the run).
  setBeforeRunHook(async () => {
    prepared = false;
    await define();
    prepared = true;
  });
  // A reload that didn't start the program again: now it's really over.
  setReloadEndHook(() => {
    if (useRemoteSession.getState().phase !== "idle" && !useApp.getState().running) ended("program ended");
  });
  const unsub = useApp.subscribe((s, prev) => {
    if (!s.device && prev.device) { ended("hub disconnected"); return; }
    if (s.running === prev.running) return;
    if (!s.running) { prepared = false; ended("program ended"); return; }
    const wasPrepared = prepared;
    prepared = false;
    const phase = useRemoteSession.getState().phase;
    if (phase === "starting") stream();
    else if (phase === "idle" && !wasPrepared) void attachLate();
  });
  // Dev hot reload replaces this module: the old copy must stop following the
  // hub, or it keeps streaming its own (start) values next to the new one's.
  import.meta.hot?.dispose(() => {
    unsub();
    stopTimers();
    ++generation;
    setBeforeRunHook(null);
    setReloadEndHook(null);
  });
  // A program already running (hot reload mid-run): take it over.
  if (useApp.getState().running) void attachLate();
}
