// Convert the reStructuredText / Google-style bits used in stub docstrings
// into Markdown for the Docs tab.

/** Returns an href for a referenced name, or null when it can't be linked. */
export type LinkResolver = (name: string) => string | null;

const ROLE_RE = /:(?:py:)?(?:func|meth|class|mod|attr|data|const|obj|exc):`([^`]+)`/g;
const SECTION_RE = /^(Args|Arguments|Parameters|Params|Keyword Args|Returns|Return|Yields|Raises|Example|Examples|Note|Notes|Warning|See Also|Attributes):\s*$/;
const DIRECTIVE_RE = /^\.\.\s+(code-block|code|sourcecode)::\s*(\w*)\s*$/;
const ADMONITION_RE = /^\.\.\s+(note|warning|tip|important|seealso|hint)::\s*(.*)$/;

function inline(text: string, resolve: LinkResolver): string {
  // Protect ``literals`` first so roles inside them are left alone.
  const lits: string[] = [];
  let s = text.replace(/``(.+?)``/g, (_, code: string) => `\uE000${lits.push(code) - 1}\uE000`);
  s = s.replace(ROLE_RE, (_, target: string) => {
    // `Title <target>` form.
    const tm = /^(.*?)\s*<([^>]+)>$/.exec(target);
    const ref = (tm ? tm[2] : target).trim();
    const shown = tm ? tm[1] : ref.startsWith("~") ? ref.slice(1).split(".").pop()! : ref;
    const href = resolve(ref);
    return href ? `[\`${shown}\`](${href})` : `\`${shown}\``;
  });
  // `Text <url>`_ links.
  s = s.replace(/`([^`<]+?)\s*<([^>]+)>`__?/g, (_, t: string, u: string) => `[${t}](${u})`);
  return s.replace(/\uE000(\d+)\uE000/g, (_, i: string) => "`" + lits[+i] + "`");
}

const indentOf = (l: string) => l.length - l.trimStart().length;

/** Docstring (already dedented) → Markdown. */
export function rstToMarkdown(doc: string, resolve: LinkResolver = () => null): string {
  const lines = doc.split("\n");
  const out: string[] = [];
  let i = 0;

  const takeIndented = (base: number): string[] => {
    const block: string[] = [];
    while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > base)) block.push(lines[i++]);
    while (block.length && !block[block.length - 1].trim()) block.pop();
    while (block.length && !block[0].trim()) block.shift();
    const margin = Math.min(...block.filter((l) => l.trim()).map(indentOf));
    return block.map((l) => l.slice(Number.isFinite(margin) ? margin : 0));
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const base = indentOf(line);

    const dm = DIRECTIVE_RE.exec(t);
    if (dm) {
      i++;
      // Skip directive options (`:linenos:` etc).
      while (i < lines.length && /^\s+:\w+:/.test(lines[i])) i++;
      out.push("```" + (dm[2] || "python"), ...takeIndented(base), "```", "");
      continue;
    }

    const am = ADMONITION_RE.exec(t);
    if (am) {
      i++;
      const label = am[1] === "seealso" ? "See also" : am[1][0].toUpperCase() + am[1].slice(1);
      const body = [am[2], ...takeIndented(base)].filter((x, k) => k > 0 || x);
      out.push(`> **${label}:** ${inline(body.join("\n"), resolve).replace(/\n/g, "\n> ")}`, "");
      continue;
    }

    const sm = SECTION_RE.exec(t);
    if (sm) {
      i++;
      const name = sm[1];
      const body = takeIndented(base);
      out.push(`**${name}:**`, "");
      if (/^(Example|Examples)$/.test(name)) {
        const isCode = body.some((l) => /^(>>>|import |\w+\s*=|\w+\.\w+\()/.test(l.trim()));
        out.push(...(isCode ? ["```python", ...body.map((l) => l.replace(/^>>> ?|^\.\.\. ?/, "")), "```"] : body.map((l) => inline(l, resolve))), "");
        continue;
      }
      // Items: `name (type): text` at the block's base indent; deeper lines continue.
      const items: string[] = [];
      for (const l of body) {
        if (!l.trim()) continue;
        if (indentOf(l) === 0) {
          const im = /^(\*{0,2}\w+)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/.exec(l);
          if (im && !/^(Returns|Return|Yields)$/.test(name)) items.push(`- **${im[1]}**${im[2] ? ` (${im[2]})` : ""}: ${im[3]}`);
          else items.push(`- ${l.trim()}`);
        } else if (items.length) items[items.length - 1] += " " + l.trim();
        else items.push(`- ${l.trim()}`);
      }
      out.push(...items.map((x) => inline(x, resolve)), "");
      continue;
    }

    // Paragraph ending in `::` introduces a literal block.
    if (t.endsWith("::") && !t.startsWith("..")) {
      i++;
      const para = t === "::" ? "" : t.replace(/::$/, ":");
      if (para) out.push(inline(para, resolve));
      while (i < lines.length && !lines[i].trim()) i++;
      out.push("", "```python", ...takeIndented(base), "```", "");
      continue;
    }

    // RST bullet lists use `*` or `-`, same as Markdown. Indentation is dropped
    // so stray indented prose isn't rendered as a Markdown code block.
    out.push(inline(base >= 4 ? t : line, resolve));
    i++;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
