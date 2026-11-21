import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../state/store";
import type { DirEntry } from "../../device/protocol";
import { CancelledError } from "../../run/deviceSync";
import { showAlert } from "../dialog";

/**
 * Browsing state of the hub's SD card: current folder, its entries (folders
 * first), loading / error / busy flags, and `op` to run a device operation with
 * a busy state, console log + error popup, then refresh.
 */
export function useDeviceFiles(active: boolean) {
  const device = useApp((s) => s.device);
  const allowRoot = useApp((s) => s.editorSettings.allowRoot);
  const appendConsole = useApp((s) => s.appendConsole);

  const [cwd, setCwd] = useState("/sd");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (path = cwd) => {
    if (!device) return;
    setLoading(true);
    setError(null);
    try {
      const result = await device.ls(path);
      result.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })));
      setEntries(result);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [device, cwd]);

  // Load when the tab is shown, the path changes, or a hub connects.
  useEffect(() => {
    if (active && device) void refresh(cwd);
  }, [active, device, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!allowRoot && !cwd.startsWith("/sd")) setCwd("/sd");
  }, [allowRoot, cwd]);

  /** Run a device operation with busy state + error popup, then refresh. */
  const op = async (label: string, fn: () => Promise<void>, refreshAfter = true) => {
    setBusy(true);
    try {
      await fn();
      if (refreshAfter) await refresh();
    } catch (e) {
      if (e instanceof CancelledError || (e as Error).message === "Cancelled") {
        appendConsole("info", `[${label} cancelled]\n`);
      } else {
        appendConsole("err", `[${label} failed: ${(e as Error).message}]\n`);
        await showAlert(`Couldn't ${label}`, (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return { cwd, setCwd, entries, loading, error, busy, refresh, op, minRoot: allowRoot ? "/" : "/sd" };
}
