// ---------------------------------------------------------------------------
// Line parsing + statement grouping (indent-aware)
// ---------------------------------------------------------------------------

export interface Line {
  indent: number;
  text: string;
  raw: string;
}

export interface Group {
  header: Line;
  bodyLines: Line[];   // raw indented body lines (may contain nested compound headers)
}

export function parseLines(source: string): Line[] {
  return source.replace(/\r\n?/g, "\n").split("\n").map((raw) => {
    const m = /^([ \t]*)/.exec(raw)!;
    const indent = m[1].replace(/\t/g, "    ").length;
    return { indent, text: raw.replace(/^[ \t]+/, "").replace(/\s+$/, ""), raw };
  });
}

/**
 * Group a flat line list into top-level statements at `baseIndent`.
 * Blank / comment lines are attached to the preceding group's body when
 * inside a body, else discarded.
 */
export function groupAt(lines: Line[], start: number, end: number, baseIndent: number): { groups: Group[] } {
  const groups: Group[] = [];
  let i = start;
  while (i < end) {
    const L = lines[i];
    if (L.text === "" || L.text.startsWith("#")) { i++; continue; }
    if (L.indent < baseIndent) break;
    if (L.indent > baseIndent) { i++; continue; } // shouldn't happen at proper base
    const g: Group = { header: L, bodyLines: [] };
    let j = i + 1;
    while (j < end) {
      const N = lines[j];
      if (N.text === "" || N.text.startsWith("#")) {
        g.bodyLines.push(N);
        j++;
        continue;
      }
      if (N.indent > baseIndent) { g.bodyLines.push(N); j++; }
      else break;
    }
    groups.push(g);
    i = j;
  }
  return { groups };
}
