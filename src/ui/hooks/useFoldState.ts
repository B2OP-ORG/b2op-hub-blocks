import { useState } from "react";

/** Stored as { id: folded } so groups not seen before fall back to their default. */
function read(key: string): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    return raw && typeof raw === "object" ? raw as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

/**
 * Folded / unfolded state of collapsible groups, remembered in localStorage
 * under `storageKey` (shared by every editor using that key).
 * `foldedByDefault`: groups that start folded until the user opens them.
 */
export function useFoldState(storageKey: string, foldedByDefault: readonly string[] = []) {
  const [map, setMap] = useState(() => read(storageKey));
  const isFolded = (id: string) => map[id] ?? foldedByDefault.includes(id);
  const toggle = (id: string) => {
    const next = { ...map, [id]: !isFolded(id) };
    setMap(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable: not remembered */ }
  };
  return { isFolded, toggle };
}

export type FoldState = ReturnType<typeof useFoldState>;
