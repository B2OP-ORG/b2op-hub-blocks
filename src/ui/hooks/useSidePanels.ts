import { useEffect, useState } from "react";

export interface SidePanelState {
  open: boolean;
  width: number;
  defaultWidth: number;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
}

interface Entry { open: boolean; width: number }

function load(key: string): Record<string, Entry> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, Partial<Entry>> | null;
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, Entry> = {};
    for (const [id, e] of Object.entries(raw)) {
      if (e && typeof e === "object" && typeof e.width === "number" && Number.isFinite(e.width) && e.width > 0) {
        out[id] = { open: e.open !== false, width: e.width };
      }
    }
    return out;
  } catch { return {}; }
}

/**
 * Open state + width of an editor's side panels, by panel id, remembered in
 * localStorage under `storageKey`. Panels not seen before start open at their
 * default width.
 */
export function useSidePanels(storageKey: string) {
  const [map, setMap] = useState(() => load(storageKey));

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(map)); } catch { /* storage unavailable: not remembered */ }
  }, [storageKey, map]);

  const patch = (id: string, defaultWidth: number, p: Partial<Entry>) =>
    setMap((m) => ({ ...m, [id]: { ...(m[id] ?? { open: true, width: defaultWidth }), ...p } }));

  return {
    panel: (id: string, defaultWidth: number): SidePanelState => {
      const e = map[id] ?? { open: true, width: defaultWidth };
      return {
        ...e,
        defaultWidth,
        setOpen: (open) => patch(id, defaultWidth, { open }),
        setWidth: (width) => patch(id, defaultWidth, { width }),
      };
    },
    /** Open / close several panels at once (toolbar toggle of one side). */
    setOpenAll: (panels: { id: string; defaultWidth: number }[], open: boolean) =>
      setMap((m) => {
        const next = { ...m };
        for (const { id, defaultWidth } of panels) next[id] = { ...(m[id] ?? { open: true, width: defaultWidth }), open };
        return next;
      }),
  };
}
