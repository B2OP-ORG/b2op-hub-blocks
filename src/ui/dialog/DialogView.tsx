import { useEffect, useRef, useState } from "react";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { Modal, ModalActions, ModalTitle } from "../components/Modal";
import { useDialogStore, type DialogRequest } from "./store";

/** One open dialog: title, body, optional list / input, buttons. */
export function DialogView({ d }: { d: DialogRequest }) {
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
    <Modal
      zIndex={50000}
      onClose={() => finish(d.cancelValue)}
      cardRef={rootRef}
      cardStyle={{ padding: 20, minWidth: 340, maxWidth: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto" }}
    >
      <ModalTitle>{d.title}</ModalTitle>
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
      <ModalActions>
        {d.buttons.map((b) => (
          <Button
            key={b.value}
            variant={b.kind ?? "default"}
            data-default={b === defaultBtn ? "" : undefined}
            disabled={!!d.input && b.value !== d.cancelValue && !!error}
            onClick={() => finish(b.value)}
          >
            {b.label}
          </Button>
        ))}
      </ModalActions>
    </Modal>
  );
}
