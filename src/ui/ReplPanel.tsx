import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";

const STYLE = {
  root: { display: "flex", flexDirection: "column" as const, height: "100%", background: "#0b1216", color: "#dff5fb", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 },
  bar: { padding: "4px 10px", background: "#0b3b48", color: "#dff5fb", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #0e7490", flexShrink: 0 },
  output: { flex: 1, overflow: "auto", padding: "6px 10px", whiteSpace: "pre-wrap" as const },
  inputRow: { display: "flex", borderTop: "1px solid #0e7490", padding: "4px 6px", gap: 4, background: "#071018", flexShrink: 0 },
  prompt: { color: "#4cc3ff", alignSelf: "center", userSelect: "none" as const, paddingRight: 4 },
  input: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#e6f4fa", fontFamily: "inherit", fontSize: 12 },
  runBtn: { background: "#0e7490", color: "#fff", border: "none", padding: "2px 10px", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 12 },
  clearBtn: { background: "transparent", color: "#dff5fb", border: "1px solid #0e7490", padding: "2px 10px", cursor: "pointer", borderRadius: 4, fontWeight: 600 },
};

export function ReplPanel() {
  const entries = useApp((s) => s.console);
  const clear = useApp((s) => s.clearConsole);
  const appendConsole = useApp((s) => s.appendConsole);
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);

  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when entries change
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const canExec = !!device && !running && !busy;

  async function submit() {
    const code = input.trim();
    if (!code || !canExec) return;
    setInput("");
    setHistIdx(-1);
    setHistory((h) => [code, ...h]);

    appendConsole("info", `> ${code}`);
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
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      if (history[idx] !== undefined) setInput(history[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? "" : (history[idx] ?? ""));
      return;
    }
  }

  return (
    <div style={STYLE.root}>
      <div style={STYLE.bar}>
        <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>Console / REPL</span>
        <button type="button" onClick={clear} style={STYLE.clearBtn}>Clear</button>
      </div>
      <div ref={outputRef} style={STYLE.output}>
        {entries.map((e, i) => (
          <div key={i} style={{ color: e.kind === "err" ? "#ff8a8a" : e.kind === "info" ? "#4cc3ff" : "#e6f4fa" }}>
            {e.text}
          </div>
        ))}
        {busy && <div style={{ color: "#a0a0a0" }}>…</div>}
      </div>
      <div style={STYLE.inputRow}>
        <span style={STYLE.prompt}>&gt;</span>
        <input
          ref={inputRef}
          style={{ ...STYLE.input, opacity: canExec ? 1 : 0.4 }}
          value={input}
          disabled={!canExec}
          placeholder={!device ? "Connect a device to use REPL" : running ? "Program running…" : "Python expression or statement"}
          onChange={(e) => { setInput(e.target.value); setHistIdx(-1); }}
          onKeyDown={onKeyDown}
        />
        <button type="button" style={{ ...STYLE.runBtn, opacity: canExec ? 1 : 0.5 }} disabled={!canExec} onClick={submit}>
          Run ↵
        </button>
      </div>
    </div>
  );
}
