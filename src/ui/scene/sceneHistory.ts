// Undo / redo of scene edits. One history per scene file, kept in memory while
// the editor is open (survives tab switches, not reloads). Snapshots are whole
// file contents (header + generated Python) plus the selection at that point.

import { useSyncExternalStore } from "react";

export interface SceneSnapshot {
  content: string;
  selected: string | null;
}

interface History {
  past: SceneSnapshot[];
  future: SceneSnapshot[];
  /** Coalescing key and time of the last recorded edit. */
  lastKey?: string;
  lastAt: number;
}

const LIMIT = 200;
/** Edits with the same key this close together merge into one step. */
const COALESCE_MS = 1000;

const histories = new Map<string, History>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; for (const l of listeners) l(); };

function hist(fileId: string): History {
  let h = histories.get(fileId);
  if (!h) histories.set(fileId, h = { past: [], future: [], lastAt: 0 });
  return h;
}

/**
 * Record an edit of `fileId`; `before` is the state it replaces. Edits with the
 * same `coalesceKey` in quick succession (nudges, colour-picker drags) share
 * one undo step.
 */
export function recordSceneEdit(fileId: string, before: SceneSnapshot, coalesceKey?: string): void {
  const h = hist(fileId);
  const now = Date.now();
  const merge = coalesceKey !== undefined && coalesceKey === h.lastKey && now - h.lastAt < COALESCE_MS && h.past.length > 0 && h.future.length === 0;
  h.lastKey = coalesceKey;
  h.lastAt = now;
  if (merge) return;
  h.past.push(before);
  if (h.past.length > LIMIT) h.past.shift();
  h.future = [];
  changed();
}

/** Step back: returns the snapshot to restore (and remembers `current` for redo), or null. */
export function undoScene(fileId: string, current: SceneSnapshot): SceneSnapshot | null {
  const h = hist(fileId);
  const prev = h.past.pop();
  if (!prev) return null;
  h.future.push(current);
  h.lastKey = undefined;
  changed();
  return prev;
}

/** Step forward again: returns the snapshot to restore, or null. */
export function redoScene(fileId: string, current: SceneSnapshot): SceneSnapshot | null {
  const h = hist(fileId);
  const next = h.future.pop();
  if (!next) return null;
  h.past.push(current);
  h.lastKey = undefined;
  changed();
  return next;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Whether `fileId` has steps to undo / redo (re-renders when that changes). */
export function useSceneHistory(fileId: string): { canUndo: boolean; canRedo: boolean } {
  useSyncExternalStore(subscribe, () => version);
  const h = histories.get(fileId);
  return { canUndo: !!h?.past.length, canRedo: !!h?.future.length };
}
