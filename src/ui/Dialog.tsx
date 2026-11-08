import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { usePalette, type Palette } from "./theme";

export type ButtonKind = "primary" | "danger" | "default";

export interface ChoiceButton<T extends string> {
  value: T;
  label: string;
  kind?: ButtonKind;
}

interface DialogRequest {
  id: number;
  title: string;
  /** Body: plain text or React content. */
  body?: React.ReactNode;
  /** When set, shows a text input. */
  input?: { initial: string; placeholder?: string; selectStem?: boolean; validate?: (v: string) => string | null };
  /** When set, shows a clickable list; clicking an item resolves with its value. */
  list?: { value: string; label: string; detail?: string; current?: boolean }[];
  buttons: ChoiceButton<string>[];
  /** Value resolved on Escape / overlay click. */
  cancelValue: string;
  resolve: (r: { value: string; text: string }) => void;
}

interface DialogStore {
  stack: DialogRequest[];
  push: (d: DialogRequest) => void;
  pop: (id: number) => void;
}

const useDialogStore = create<DialogStore>((set) => ({
  stack: [],
  push: (d) => set((s) => ({ stack: [...s.stack, d] })),
  pop: (id) => set((s) => ({ stack: s.stack.filter((d) => d.id !== id) })),
}));

let nextId = 1;

function request(opts: Omit<DialogRequest, "id" | "resolve">): Promise<{ value: string; text: string }> {
  return new Promise((resolve) => {
    useDialogStore.getState().push({ ...opts, id: nextId++, resolve });
  });
}

export async function showAlert(title: string, body?: React.ReactNode): Promise<void> {
  await request({ title, body, buttons: [{ value: "ok", label: "OK", kind: "primary" }], cancelValue: "ok" });
}

export async function showConfirm(
  title: string,
  body?: React.ReactNode,
  opts: { confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  const r = await request({
    title,
    body,
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "ok", label: opts.confirmLabel ?? "OK", kind: opts.danger ? "danger" : "primary" },
    ],
    cancelValue: "cancel",
  });
  return r.value === "ok";
}

export async function showPrompt(
  title: string,
  initial = "",
  opts: { body?: React.ReactNode; confirmLabel?: string; placeholder?: string; selectStem?: boolean; validate?: (v: string) => string | null } = {},
): Promise<string | null> {
  const r = await request({
    title,
    body: opts.body,
    input: { initial, placeholder: opts.placeholder, selectStem: opts.selectStem, validate: opts.validate },
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "ok", label: opts.confirmLabel ?? "OK", kind: "primary" },
    ],
    cancelValue: "cancel",
  });
  return r.value === "ok" ? r.text : null;
}

/** Arbitrary button set; resolves with the chosen value (or `cancelValue`). */
export async function showChoice<T extends string>(
  title: string,
  body: React.ReactNode,
  buttons: ChoiceButton<T>[],
  cancelValue: T,
): Promise<T> {
  const r = await request({ title, body, buttons, cancelValue });
  return r.value as T;
}

/** Pick one entry from a list. Resolves with its value, or null when cancelled. */
export async function showList(
  title: string,
  items: { value: string; label: string; detail?: string; current?: boolean }[],
  body?: React.ReactNode,
): Promise<string | null> {
  const r = await request({ title, body, list: items, buttons: [{ value: "\u0000cancel", label: "Cancel" }], cancelValue: "\u0000cancel" });
  return r.value === "\u0000cancel" ? null : r.value;
}

/** Choice dialog with an input, e.g. "New project" (name + Blocks/Python). */
export async function showPromptChoice<T extends string>(
  title: string,
  initial: string,
  buttons: ChoiceButton<T>[],
  cancelValue: T,
  opts: { body?: React.ReactNode; placeholder?: string; validate?: (v: string) => string | null } = {},
): Promise<{ value: T; text: string }> {
  const r = await request({ title, body: opts.body, input: { initial, placeholder: opts.placeholder, validate: opts.validate }, buttons, cancelValue });
  return { value: r.value as T, text: r.text };
}

export function buttonStyle(p: Palette, kind: ButtonKind = "default"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  };
  if (kind === "primary") return { ...base, background: p.accent, color: "#fff", border: "1px solid #155e75" };
  if (kind === "danger") return { ...base, background: "#b91c1c", color: "#fff", border: "1px solid #7f1d1d" };
  return { ...base, background: "transparent", color: p.text, border: `1px solid ${p.border}` };
}

function DialogView({ d }: { d: DialogRequest }) {
  const p = usePalette();
  const pop = useDialogStore((s) => s.pop);
  const [text, setText] = useState(d.input?.initial ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const error = d.input?.validate?.(text) ?? null;

  const finish = (value: string) => {
    if (d.input && value !== d.cancelValue && error) return;
    pop(d.id);
    d.resolve({ value, text: text.trim() });
  };

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      if (d.input?.selectStem) {
        const dot = el.value.lastIndexOf(".");
        el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
      } else {
        el.select();
      }
    } else {
      // Focus the last (default) button.
      rootRef.current?.querySelector<HTMLButtonElement>("[data-default]")?.focus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultBtn = d.buttons[d.buttons.length - 1];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: p.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50000 }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) finish(d.cancelValue); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); finish(d.cancelValue); }
      }}
    >
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        style={{
          background: p.surface,
          color: p.text,
          padding: 20,
          borderRadius: 12,
          minWidth: 340,
          maxWidth: "min(560px, 94vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          border: `1px solid ${p.border}`,
          boxShadow: p.shadow,
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>{d.title}</h3>
        {d.body && <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12, overflowWrap: "anywhere" }}>{d.body}</div>}
        {d.list && (
          <div style={{ border: `1px solid ${p.border}`, borderRadius: 6, maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
            {d.list.map((it) => (
              <button
                key={it.value}
                type="button"
                onClick={() => finish(it.value)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: it.current ? p.activeBg : "none",
                  border: "none", borderBottom: `1px solid ${p.border}`, color: p.text, cursor: "pointer", fontSize: 13, overflowWrap: "anywhere",
                }}
                onMouseEnter={(e) => { if (!it.current) e.currentTarget.style.background = p.hoverBg; }}
                onMouseLeave={(e) => { if (!it.current) e.currentTarget.style.background = "none"; }}
              >
                <div style={{ fontWeight: 600 }}>{it.label}</div>
                {it.detail && <div style={{ fontSize: 11, color: p.dimText }}>{it.detail}</div>}
              </button>
            ))}
          </div>
        )}
        {d.input && (
          <div style={{ marginBottom: 12 }}>
            <input
              ref={inputRef}
              value={text}
              placeholder={d.input.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finish(defaultBtn.value); } }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: p.inputBg,
                color: p.text,
                border: `1px solid ${error ? "#b91c1c" : p.border}`,
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 13,
                outline: "none",
              }}
            />
            {error && <div style={{ color: p.danger, fontSize: 12, marginTop: 4 }}>{error}</div>}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {d.buttons.map((b) => (
            <button
              key={b.value}
              type="button"
              data-default={b === defaultBtn ? "" : undefined}
              disabled={!!d.input && b.value !== d.cancelValue && !!error}
              style={{ ...buttonStyle(p, b.kind), opacity: d.input && b.value !== d.cancelValue && error ? 0.5 : 1 }}
              onClick={() => finish(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mount once near the app root. */
export function DialogHost() {
  const stack = useDialogStore((s) => s.stack);
  if (stack.length === 0) return null;
  return createPortal(<>{stack.map((d) => <DialogView key={d.id} d={d} />)}</>, document.body);
}
