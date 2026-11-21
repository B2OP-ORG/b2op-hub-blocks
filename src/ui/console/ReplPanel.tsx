import { useEffect, useRef, useState } from "react";
import { useApp } from "../../state/store";
import { useDark } from "../theme";
import { parseAnsi } from "./ansi";
import { useInputHistory } from "./useInputHistory";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Compact "Clear" control rendered in the console drawer's header. */
export function ConsoleHeaderActions() {
  const clear = useApp((s) => s.clearConsole);
  return (
    <button
      type="button"
      onClick={clear}
      title="Clear console (Ctrl+L)"
      style={{
        background: "rgba(255,255,255,0.14)",
        color: "#ffffff",
        border: "1px solid rgba(255,255,255,0.35)",
        padding: "0 8px",
        height: 16,
        lineHeight: "14px",
        cursor: "pointer",
        borderRadius: 3,
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      Clear
    </button>
  );
}

export function ReplPanel() {
  const entries = useApp((s) => s.console);
  const clear = useApp((s) => s.clearConsole);
  const appendConsole = useApp((s) => s.appendConsole);
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);
  const dark = useDark();

  const hist = useInputHistory();
  const { input } = hist;
  const [busy, setBusy] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when entries change
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, busy]);

  const available = !!device && !running;
  const canExec = available && !busy;

  async function submit() {
    const code = input.trim();
    if (!code || !canExec) return;
    hist.commit(code);

    appendConsole("info", `>>> ${code}`);
    setBusy(true);
    try {
      const result = await device!.exec(code);
      if (result.error) {
        appendConsole("err", result.error);
      }
    } catch (e) {
      appendConsole("err", String(e));
    } finally {
      setBusy(false);
      // Keep typing without clicking back into the box.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hist.clear();
      return;
    }
    if (e.key.toLowerCase() === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      hist.older();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      hist.newer();
    }
  }

  const bg = dark ? "#0b1216" : "#ffffff";
  const fg = dark ? "#e6f4fa" : "#0b3b48";
  const border = dark ? "#164e63" : "#b6dbe4";
  const infoColor = dark ? "#4cc3ff" : "#0e7490";
  const errColor = dark ? "#ff8a8a" : "#b91c1c";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: bg, color: fg, fontFamily: MONO, fontSize: 12 }}>
      <div
        ref={outputRef}
        style={{ flex: 1, overflow: "auto", padding: "6px 10px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        onMouseUp={() => {
          // Click (not a text selection) in the log focuses the prompt.
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
      >
        {entries.map((e, i) => (
          <div key={i} style={{ color: e.kind === "err" ? errColor : e.kind === "info" ? infoColor : fg }}>
            {parseAnsi(e.text)}
          </div>
        ))}
        {busy && <div style={{ color: "#a0a0a0" }}>…</div>}
      </div>
      <div style={{ display: "flex", borderTop: `1px solid ${border}`, padding: "3px 6px", gap: 4, background: dark ? "#071018" : "#f3f9fb", flexShrink: 0 }}>
        <span style={{ color: infoColor, alignSelf: "center", userSelect: "none", paddingRight: 4 }}>&gt;</span>
        <input
          ref={inputRef}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: fg, fontFamily: "inherit", fontSize: 12, opacity: available ? 1 : 0.4 }}
          value={input}
          disabled={!available}
          placeholder={!device ? "Connect a hub to use the REPL" : running ? "Program running…" : "Python expression or statement · Enter to send"}
          onChange={(e) => hist.setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          style={{ background: "#0e7490", color: "#fff", border: "none", padding: "2px 10px", borderRadius: 4, cursor: canExec ? "pointer" : "default", fontWeight: 600, fontSize: 12, opacity: canExec ? 1 : 0.5 }}
          disabled={!canExec}
          // Keep focus in the input when clicking Send.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
