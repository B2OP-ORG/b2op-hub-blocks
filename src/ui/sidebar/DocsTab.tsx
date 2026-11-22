import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, FileText, House, Search, X } from "lucide-react";
import { useApp } from "../../state/store";
import { usePalette } from "../theme";
import { IconButton } from "../components/IconButton";
import { ListRow, RowDetail, RowLabel } from "../components/ListRow";
import { PanelHeader } from "../components/PanelHeader";
import { SectionTitle } from "../components/SectionTitle";
import { DocRow, ModuleTree } from "./DocsModuleTree";
import { GUIDES } from "../../docs/guides";
import { apiModules, rootModules, searchIndex } from "../../docs/apiModel";
import { pageContent } from "../../docs/pages";
import { newId } from "../../utils/id";

const GROUP_TITLE: React.CSSProperties = { padding: "10px 12px 3px", letterSpacing: 0.5 };

const DocPage = lazy(() => import("../docs/DocPage").then((m) => ({ default: m.DocPage })));

/** Open a doc page as an editor tab. */
function openDocInTab(pageId: string) {
  const title = pageContent(pageId)?.title ?? "Docs";
  useApp.getState().openExtraTab({ id: `doc:${newId()}`, kind: "doc", title, ref: pageId });
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
            <ListRow key={h.id} block padY={5} padX={12} onClick={() => go(h.id)}>
              <RowLabel style={{ display: "flex", gap: 5, alignItems: "center", fontWeight: 600 }}>
                {h.guide ? <BookOpen size={12} /> : null}{h.label}
              </RowLabel>
              {h.detail && <RowDetail>{h.detail}</RowDetail>}
            </ListRow>
          )) : <div style={{ padding: 12, color: p.dimText }}>Nothing found for “{query}”.</div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            {[...new Set(GUIDES.map((g) => g.group))].map((group) => (
              <div key={group}>
                <SectionTitle style={GROUP_TITLE}>{group}</SectionTitle>
                {GUIDES.filter((g) => g.group === group).map((g) => (
                  <DocRow key={g.id} icon={<FileText size={13} />} label={g.title} onClick={() => go(`guide:${g.id}`)} />
                ))}
              </div>
            ))}
            <SectionTitle style={GROUP_TITLE}>Reference</SectionTitle>
            {rootModules(mods).map((r) => (
              <ModuleTree key={r} mod={mods.get(r)!} mods={mods} depth={0} expanded={expanded} toggle={toggle} go={go} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
