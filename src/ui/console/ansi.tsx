// ANSI SGR escape codes (colours, bold) in console output → styled spans.

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

/** Render text with ANSI SGR colour / bold codes as styled spans. */
export function parseAnsi(text: string): React.ReactNode {
  // ESC [ … m (ESC built from its code: a literal control character in a regex trips the linter).
  const re = new RegExp(`${String.fromCharCode(27)}\\[([0-9;]*)m`, "g");
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
