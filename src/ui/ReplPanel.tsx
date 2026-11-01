import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";

const ANSI_FG: Record<number, string> = {
  30: "#000", 31: "#cd3131", 32: "#0dbc79", 33: "#e5e510",
  34: "#2472c8", 35: "#bc3fbc", 36: "#11a8cd", 37: "#e5e5e5",
  90: "#666", 91: "#f14c4c", 92: "#23d18b", 93: "#f5f543",
  94: "#3b8eea", 95: "#d670d6", 96: "#29b8db", 97: "#fff",
};
const ANSI_BG: Record<number, string> = {
  40: "#000", 41: "#cd3131", 42: "#0dbc79", 43: "#e5e510",
  44: "#2472c8", 45: "#bc3fbc", 46: "#11a8cd", 47: "#e5e5e5",
  100: "#666", 101: "#f14c4c", 102: "#23d18b", 103: "#f5f543",
  104: "#3b8eea", 105: "#d670d6", 106: "#29b8db", 107: "#fff",
};

type AnsiSty = { color?: string; background?: string; fontWeight?: string };

function applyAnsiCodes(s: AnsiSty, codes: number[]): AnsiSty {
  const n = { ...s };
  for (const c of codes) {
    if (c === 0) { delete n.color; delete n.background; delete n.fontWeight; }
    else if (c === 1) n.fontWeight = "bold";
    else if (c === 22) delete n.fontWeight;
    else if (c === 39) delete n.color;
    else if (c === 49) delete n.background;
    else if (ANSI_FG[c]) n.color = ANSI_FG[c];
    else if (ANSI_BG[c]) n.background = ANSI_BG[c];
  }
  return n;
}

function parseAnsi(text: string): React.ReactNode {
  const re = /\x1b\[([0-9;]*)m/g;
  const nodes: React.ReactNode[] = [];
  let sty: AnsiSty = {};
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<span key={key++} style={sty}>{text.slice(last, m.index)}</span>);
    last = re.lastIndex;
    sty = applyAnsiCodes(sty, m[1] ? m[1].split(";").map(Number) : [0]);
  }
  if (last < text.length) nodes.push(<span key={key++} style={sty}>{text.slice(last)}</span>);
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return <>{nodes}</>;
}

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
            {parseAnsi(e.text)}
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
