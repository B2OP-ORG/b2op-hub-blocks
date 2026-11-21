import { useState } from "react";

/**
 * Text input with shell-like history: ↑ / ↓ browse earlier entries (newest
 * first); the line being typed is kept as a draft while browsing.
 */
export function useInputHistory() {
  const [input, setInputRaw] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [draft, setDraft] = useState("");

  return {
    input,
    /** Typed text (leaves history browsing). */
    setInput: (v: string) => { setInputRaw(v); setHistIdx(-1); },
    /** Remember a submitted line and clear the input. */
    commit: (line: string) => {
      setInputRaw("");
      setDraft("");
      setHistIdx(-1);
      setHistory((h) => (h[0] === line ? h : [line, ...h]));
    },
    /** Escape: clear the input. */
    clear: () => { setInputRaw(""); setHistIdx(-1); },
    /** ↑: step to an older entry. */
    older: () => {
      if (history.length === 0) return;
      if (histIdx === -1) setDraft(input);
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      setInputRaw(history[idx]);
    },
    /** ↓: step to a newer entry, back to the draft at the end. */
    newer: () => {
      if (histIdx === -1) return;
      const idx = histIdx - 1;
      setHistIdx(idx);
      setInputRaw(idx === -1 ? draft : history[idx]);
    },
  };
}
