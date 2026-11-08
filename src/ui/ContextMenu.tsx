import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { usePalette } from "./theme";

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
const useMenuStore = create<MenuState>((set) => ({
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

export function closeContextMenu() {
  useMenuStore.getState().close();
}

/** Mount once near the app root. */
export function ContextMenuHost() {
  const open = useMenuStore((s) => s.open);
  const close = useMenuStore((s) => s.close);
  const p = usePalette();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);

  // Measure, then clamp / flip into the viewport before paint.
  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const el = ref.current;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 4;
    let left = open.x, top = open.y;
    if (left + width > vw - m) left = Math.max(m, open.x - width);
    if (top + height > vh - m) top = Math.max(m, open.y - height);
    if (left + width > vw - m) left = Math.max(m, vw - m - width);
    if (top + height > vh - m) top = Math.max(m, vh - m - height);
    setPos({ left, top });
    setFocusIdx(-1);
    el.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Capture phase so editors (Blockly/Monaco) that stop propagation can't block closing.
    const onDown = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("contextmenu", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("wheel", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("contextmenu", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onScroll, true);
    };
  }, [open, close]);

  const select = useCallback((item: MenuAction) => {
    if (item.disabled) return;
    close();
    // Run after the menu unmounts so handlers that open dialogs/menus work cleanly.
    setTimeout(item.onSelect, 0);
  }, [close]);

  if (!open) return null;

  const actions = open.items.map((it, i) => ({ it, i })).filter((x) => x.it !== "separator" && !(x.it as MenuAction).disabled);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (actions.length === 0) return;
      const cur = actions.findIndex((a) => a.i === focusIdx);
      const next = e.key === "ArrowDown" ? (cur + 1) % actions.length : (cur <= 0 ? actions.length - 1 : cur - 1);
      setFocusIdx(actions[next].i);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const it = open.items[focusIdx];
      if (it && it !== "separator") select(it);
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: pos?.left ?? open.x,
        top: pos?.top ?? open.y,
        visibility: pos ? "visible" : "hidden",
        zIndex: 100000,
        minWidth: 170,
        maxWidth: 320,
        maxHeight: "calc(100vh - 8px)",
        overflowY: "auto",
        background: p.menuBg,
        color: p.text,
        border: `1px solid ${p.border}`,
        borderRadius: 6,
        boxShadow: p.dark ? "0 6px 20px rgba(0,0,0,0.55)" : "0 6px 20px rgba(0,111,143,0.22)",
        padding: "4px 0",
        fontSize: 13,
        outline: "none",
        userSelect: "none",
      }}
    >
      {open.items.map((it, i) =>
        it === "separator" ? (
          <div key={i} style={{ height: 1, background: p.border, margin: "4px 0" }} />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={() => setFocusIdx(i)}
            onMouseLeave={() => setFocusIdx(-1)}
            onClick={() => select(it)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 12px",
              background: focusIdx === i ? p.hoverBg : "none",
              border: "none",
              textAlign: "left",
              cursor: it.disabled ? "default" : "pointer",
              color: it.danger ? p.danger : p.text,
              opacity: it.disabled ? 0.45 : 1,
              fontSize: 13,
            }}
          >
            <span style={{ width: 14, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.hint && <span style={{ fontSize: 11, color: p.dimText, marginLeft: 12 }}>{it.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
