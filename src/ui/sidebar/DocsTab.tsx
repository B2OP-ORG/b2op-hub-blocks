import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, ExternalLink, FileText, House, Search, X } from "lucide-react";
import { useApp } from "../../state/store";
import { usePalette } from "../theme";
import { IconButton, PanelHeader, wrapText } from "./common";
import { GUIDES } from "../../docs/guides";
import { apiModules, classesOf, rootModules, searchIndex, type ApiModule } from "../../docs/apiModel";
import { pageContent } from "../../docs/pages";

const DocPage = lazy(() => import("../../docs/DocPage").then((m) => ({ default: m.DocPage })));

/** Open a doc page as an editor tab. */
function openDocInTab(pageId: string) {
  const title = pageContent(pageId)?.title ?? "Docs";
  useApp.getState().openExtraTab({ id: `doc:${crypto.randomUUID()}`, kind: "doc", title, ref: pageId });
}

function Row({ depth = 0, icon, label, detail, onClick, onToggle, open, active }: {
  depth?: number;
  icon?: React.ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  onToggle?: () => void;
  open?: boolean;
  active?: boolean;
}) {
  const p = usePalette();
  return (
    <div
      role="button"
      tabIndex={0}
      title={detail}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: `3px 8px 3px ${8 + depth * 14}px`, cursor: "pointer", userSelect: "none", background: active ? p.activeBg : "transparent" }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = p.hoverBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span
        style={{ width: 14, flexShrink: 0, display: "inline-flex", paddingTop: 2, color: p.dimText }}
        onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      >
        {onToggle ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
      </span>
      {icon && <span style={{ display: "inline-flex", paddingTop: 2, color: p.dimText, flexShrink: 0 }}>{icon}</span>}
      <span style={wrapText}>{label}</span>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <div style={{ padding: "10px 12px 3px", fontSize: 11, fontWeight: 700, color: p.dimText, textTransform: "uppercase", letterSpacing: 0.5 }}>{children}</div>;
}

function ModuleTree({ mod, mods, depth, expanded, toggle, go }: {
  mod: ApiModule;
  mods: Map<string, ApiModule>;
  depth: number;
  expanded: Set<string>;
  toggle: (k: string) => void;
  go: (id: string) => void;
}) {
  const classes = classesOf(mod);
  const hasKids = mod.children.length > 0 || classes.length > 0;
  const open = expanded.has(mod.name);
  return (
    <>
      <Row
        depth={depth}
        label={mod.title === mod.name ? mod.name : `${mod.title}`}
        detail={mod.name}
        onClick={() => go(`api:${mod.name}`)}
        onToggle={hasKids ? () => toggle(mod.name) : undefined}
        open={open}
      />
      {open && mod.children.map((c) => <ModuleTree key={c} mod={mods.get(c)!} mods={mods} depth={depth + 1} expanded={expanded} toggle={toggle} go={go} />)}
      {open && classes.map((c) => <Row key={c.name} depth={depth + 1} label={c.name} detail={`${mod.name}.${c.name}`} onClick={() => go(`api:${mod.name}#${c.name}`)} />)}
    </>
  );
}

export function DocsTab() {
  const p = usePalette();
  const [history, setHistory] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["hub", "lpf2"]));
  const mods = useMemo(() => apiModules(), []);
  const index = useMemo(() => searchIndex(mods), [mods]);
  const current = history[history.length - 1];

  const go = (id: string) => { setHistory((h) => [...h, id]); setQuery(""); };
  const back = () => setHistory((h) => h.slice(0, -1));
  const toggle = (k: string) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return [];
    const guides = GUIDES.filter((g) => g.title.toLowerCase().includes(q) || g.markdown.toLowerCase().includes(q))
      .map((g) => ({ id: `guide:${g.id}`, label: g.title, detail: "Guide", guide: true }));
    const api = index.filter((h) => h.label.toLowerCase().includes(q) || h.detail.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.label.toLowerCase().includes(q)) - Number(!b.label.toLowerCase().includes(q)))
      .slice(0, 60)
      .map((h) => ({ ...h, guide: false }));
    return [...guides, ...api];
  }, [q, index]);

  const title = current ? pageContent(current)?.title : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Docs" subtitle={title}>
        {current && <IconButton title="Back" onClick={back}><ArrowLeft size={15} /></IconButton>}
        {current && <IconButton title="All docs" onClick={() => setHistory([])}><House size={15} /></IconButton>}
        {current && <IconButton title="Open in editor tab" onClick={() => openDocInTab(current)}><ExternalLink size={15} /></IconButton>}
      </PanelHeader>

      {!current && (
        <div style={{ padding: "6px 8px", borderBottom: `1px solid ${p.border}`, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <Search size={13} color={p.dimText} style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); if (e.key === "Enter" && hits[0]) go(hits[0].id); }}
            placeholder="Search docs…"
            aria-label="Search docs"
            style={{ flex: 1, minWidth: 0, background: p.inputBg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 12, outline: "none" }}
          />
          {query && <IconButton title="Clear search" onClick={() => setQuery("")}><X size={13} /></IconButton>}
        </div>
      )}

      <div data-doc-scroll style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {current ? (
          <Suspense fallback={null}>
            <DocPage pageId={current} onNavigate={go} compact />
          </Suspense>
        ) : q ? (
          hits.length ? hits.map((h) => (
            <div key={h.id} onClick={() => go(h.id)} style={{ padding: "5px 12px", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = p.hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <div style={{ ...wrapText, display: "flex", gap: 5, alignItems: "center", fontWeight: 600 }}>
                {h.guide ? <BookOpen size={12} /> : null}{h.label}
              </div>
              {h.detail && <div style={{ fontSize: 11, color: p.dimText, overflowWrap: "anywhere" }}>{h.detail}</div>}
            </div>
          )) : <div style={{ padding: 12, color: p.dimText }}>Nothing found for “{query}”.</div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            {[...new Set(GUIDES.map((g) => g.group))].map((group) => (
              <div key={group}>
                <GroupTitle>{group}</GroupTitle>
                {GUIDES.filter((g) => g.group === group).map((g) => (
                  <Row key={g.id} icon={<FileText size={13} />} label={g.title} onClick={() => go(`guide:${g.id}`)} />
                ))}
              </div>
            ))}
            <GroupTitle>Reference</GroupTitle>
            {rootModules(mods).map((r) => (
              <ModuleTree key={r} mod={mods.get(r)!} mods={mods} depth={0} expanded={expanded} toggle={toggle} go={go} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
