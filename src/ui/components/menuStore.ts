// Imperative context menu API: openContextMenu / openMenuAt; <ContextMenuHost /> renders it.

import { create } from "zustand";

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Short hint shown on the right (e.g. a shortcut or "needs connection"). */
  hint?: string;
  onSelect: () => void;
}

export type MenuItem = MenuAction | "separator";

interface MenuState {
  open: { x: number; y: number; items: MenuItem[] } | null;
  show: (x: number, y: number, items: MenuItem[]) => void;
  close: () => void;
}

/** One global menu: opening a new one always replaces the previous. */
export const useMenuStore = create<MenuState>((set) => ({
  open: null,
  show: (x, y, items) => set({ open: { x, y, items } }),
  close: () => set({ open: null }),
}));

/** Open a context menu at the event position. Items that are `false`/`null` are dropped. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: Array<MenuItem | false | null | undefined>) {
  e.preventDefault?.();
  e.stopPropagation?.();
  const clean = items.filter((i): i is MenuItem => !!i);
  // Collapse leading/trailing/double separators.
  const tidy: MenuItem[] = [];
  for (const it of clean) {
    if (it === "separator" && (tidy.length === 0 || tidy[tidy.length - 1] === "separator")) continue;
    tidy.push(it);
  }
  while (tidy[tidy.length - 1] === "separator") tidy.pop();
  if (tidy.length === 0) return;
  useMenuStore.getState().show(e.clientX, e.clientY, tidy);
}

/** Open a menu anchored below an element (for "⋯" buttons). */
export function openMenuAt(el: HTMLElement, items: Array<MenuItem | false | null | undefined>) {
  const r = el.getBoundingClientRect();
  openContextMenu({ clientX: r.left, clientY: r.bottom + 2 }, items);
}
