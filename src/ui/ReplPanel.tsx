import { useEffect, useRef, useState } from "react";
import { useApp, useDark } from "../state/store";

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

  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [draft, setDraft] = useState("");
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
    setInput("");
    setDraft("");
    setHistIdx(-1);
    setHistory((h) => (h[0] === code ? h : [code, ...h]));

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
      setInput("");
      setHistIdx(-1);
      return;
    }
    if (e.key.toLowerCase() === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      if (histIdx === -1) setDraft(input);
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      setInput(history[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const idx = histIdx - 1;
      setHistIdx(idx);
      setInput(idx === -1 ? draft : history[idx]);
      return;
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
          onChange={(e) => { setInput(e.target.value); setHistIdx(-1); }}
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
