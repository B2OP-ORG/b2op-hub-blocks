import { useEffect, useMemo, useRef, useState } from "react";
import { Marked } from "marked";
import type { HighlighterCore } from "shiki/core";
import { usePalette } from "../ui/theme";
import { DARK_THEME, LIGHT_THEME } from "../editor/shikiSetup";
import { loadDocHighlighter } from "./highlight";
import { pageContent } from "./pages";
import "./docs.css";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function makeMarked(hl: HighlighterCore | null, dark: boolean): Marked {
  return new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) {
        const language = (lang || "python").split(/\s/)[0];
        const inner = hl && language === "python"
          ? hl.codeToHtml(text, { lang: "python", theme: dark ? DARK_THEME : LIGHT_THEME })
          : `<pre><code>${escapeHtml(text)}</code></pre>`;
        return `<div class="doc-code">${inner}<button type="button" class="doc-copy" data-copy title="Copy code">Copy</button></div>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        if (href.startsWith("doc:")) return `<a href="#" data-doc="${escapeHtml(href.slice(4))}">${text}</a>`;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
    },
  });
}

/** Renders one doc page. Internal links call `onNavigate` with a page id. */
export function DocPage({ pageId, onNavigate, compact }: { pageId: string; onNavigate: (id: string) => void; compact?: boolean }) {
  const p = usePalette();
  const ref = useRef<HTMLDivElement>(null);
  const [hl, setHl] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    let alive = true;
    loadDocHighlighter().then((h) => { if (alive) setHl(h); }).catch(() => { /* plain code blocks */ });
    return () => { alive = false; };
  }, []);

  const content = useMemo(() => pageContent(pageId), [pageId]);
  const html = useMemo(() => {
    if (!content) return "";
    return makeMarked(hl, p.dark).parse(content.markdown, { async: false }) as string;
  }, [content, hl, p.dark]);

  // Scroll to the requested entry (or the top) whenever the page changes.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const target = content?.anchor ? root.querySelector(`#${CSS.escape(content.anchor)}`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else root.closest("[data-doc-scroll]")?.scrollTo({ top: 0 });
    // Only on navigation, not when highlighting finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const onClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const link = el.closest<HTMLAnchorElement>("a[data-doc]");
    if (link) {
      e.preventDefault();
      onNavigate(link.dataset.doc!);
      return;
    }
    const copy = el.closest<HTMLButtonElement>("button[data-copy]");
    if (copy) {
      const code = copy.parentElement?.querySelector("pre")?.textContent ?? "";
      void navigator.clipboard?.writeText(code).then(() => {
        copy.textContent = "Copied!";
        setTimeout(() => { copy.textContent = "Copy"; }, 1200);
      });
    }
  };

  if (!content) {
    return <div style={{ padding: 16, color: p.dimText }}>This page doesn't exist.</div>;
  }

  return (
    <div
      ref={ref}
      className={`doc-page ${p.dark ? "doc-dark" : "doc-light"}${compact ? " doc-compact" : ""}`}
      style={{ ["--doc-text" as string]: p.text, ["--doc-dim" as string]: p.dimText, ["--doc-border" as string]: p.border, ["--doc-accent" as string]: p.dark ? "#38bdf8" : p.accent, ["--doc-code-bg" as string]: p.dark ? "#1e1e1e" : "#ffffff", ["--doc-card-bg" as string]: p.hoverBg }}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
