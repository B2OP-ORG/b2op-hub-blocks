import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { KIND_LABEL, isContainer, type SceneDoc } from "../../scene/model";
import { isOutside } from "../../scene/geometry";
import { canDrop, type TreeDrop } from "../../scene/reorder";
import { usePalette } from "../theme";
import { IconButton } from "../components/IconButton";
import { ListRow } from "../components/ListRow";

/** Id of the scene's own row in `collapsed`. */
export const OUTLINE_ROOT = "__scene__";
const DND_TYPE = "application/x-b2op-outline";

/** Drop for a pointer at `frac` (0 = top, 1 = bottom) of a widget row: edges = before / after, middle of a container = into. */
function dropAt(uid: string, container: boolean, frac: number): TreeDrop {
  if (container) return frac < 0.25 ? { at: "before", uid } : frac > 0.75 ? { at: "after", uid } : { at: "into", parent: uid };
  return frac < 0.5 ? { at: "before", uid } : { at: "after", uid };
}

/**
 * Widget tree (scene → widgets → children) in the scene editor; every node
 * with children folds. Drag rows to reorder them or move them into / out of
 * containers; the arrows of the selected row reorder too.
 */
export function Outline({ doc, selected, collapsed, onToggle, onSelect, onMove, onDropWidget, editable }: {
  doc: SceneDoc;
  selected: string | null;
  /** Folded nodes: widget uids and/or OUTLINE_ROOT. */
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, dir: -1 | 1) => void;
  onDropWidget: (uid: string, drop: TreeDrop) => void;
  /** Drag & drop allowed (not in preview). */
  editable: boolean;
}) {
  const p = usePalette();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TreeDrop | null>(null);
  const endDrag = () => { setDragging(null); setOver(null); };

  /** Drag & drop handlers of a row; `drop` maps the pointer to a drop. */
  const dnd = (uid: string | null, drop: (e: React.DragEvent) => TreeDrop): React.HTMLAttributes<HTMLDivElement> => {
    if (!editable) return {};
    return {
      draggable: uid !== null,
      onDragStart: uid === null ? undefined : (e) => {
        e.stopPropagation();
        e.dataTransfer.setData(DND_TYPE, uid);
        e.dataTransfer.effectAllowed = "move";
        setDragging(uid);
      },
      onDragOver: (e) => {
        if (!dragging || !e.dataTransfer.types.includes(DND_TYPE)) return;
        e.stopPropagation();
        const d = drop(e);
        if (!canDrop(doc, dragging, d)) { setOver(null); return; }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (JSON.stringify(d) !== JSON.stringify(over)) setOver(d);
      },
      onDrop: (e) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        const d = drop(e);
        if (canDrop(doc, dragging, d)) onDropWidget(dragging, d);
        endDrag();
      },
      onDragEnd: endDrag,
    };
  };
  const frac = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientY - r.top) / Math.max(1, r.height);
  };
  /** Drop marker: line above / below the row, or a frame for "into". */
  const marker = (uid: string | undefined): React.CSSProperties | undefined => {
    if (!over) return undefined;
    if (over.at === "into" ? over.parent === uid : over.uid === uid) {
      if (over.at === "into") return { boxShadow: `inset 0 0 0 1px ${p.accent}` };
      return { boxShadow: `inset 0 ${over.at === "before" ? 2 : -2}px 0 ${p.accent}` };
    }
    return undefined;
  };
  const twisty = (id: string, hasKids: boolean) => (
    <span
      onClick={hasKids ? (e) => { e.stopPropagation(); onToggle(id); } : undefined}
      title={hasKids ? (collapsed.has(id) ? "Expand" : "Collapse") : undefined}
      style={{ width: 14, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: p.dimText }}
    >
      {hasKids && (collapsed.has(id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />)}
    </span>
  );

  const rows: React.ReactNode[] = [];
  const visit = (parent: string | undefined, depth: number) => {
    for (const w of doc.widgets.filter((x) => x.parent === parent)) {
      const isSel = w.uid === selected;
      const off = isOutside(doc, w);
      const hasKids = isContainer(w.kind) && doc.widgets.some((x) => x.parent === w.uid);
      rows.push(
        <ListRow key={w.uid} depth={depth} padY={2} padX={4} gap={2} active={isSel} onClick={() => onSelect(w.uid)}
          {...dnd(w.uid, (e) => dropAt(w.uid, isContainer(w.kind), frac(e)))}
          style={{ alignItems: "center", opacity: w.hidden || dragging === w.uid ? 0.5 : 1, ...marker(w.uid) }}>
          {twisty(w.uid, hasKids)}
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {w.name}
            {off && <span style={{ color: p.danger, fontSize: 11 }} title="Outside its parent / the screen: it won't be visible"> off screen</span>}
            <span style={{ color: p.dimText, fontSize: 11 }}> {KIND_LABEL[w.kind]}{w.tab !== undefined && doc.widgets.find((o) => o.uid === w.parent)?.kind === "tabview" ? ` · tab ${w.tab + 1}` : ""}</span>
          </span>
          {isSel && (
            <>
              <IconButton variant="toolbar" title="Move back (drawn earlier, earlier in focus order)" onClick={() => onMove(w.uid, -1)}><ArrowUp size={12} /></IconButton>
              <IconButton variant="toolbar" title="Move forward (drawn later, later in focus order)" onClick={() => onMove(w.uid, 1)}><ArrowDown size={12} /></IconButton>
            </>
          )}
        </ListRow>,
      );
      if (hasKids && !collapsed.has(w.uid)) visit(w.uid, depth + 1);
    }
  };
  const rootOpen = !collapsed.has(OUTLINE_ROOT);
  if (rootOpen) visit(undefined, 1);

  return (
    // Empty space below the rows: drop at the end of the screen's widgets.
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", fontSize: 12 }} {...dnd(null, () => ({ at: "into", parent: undefined }))}>
      <ListRow padY={4} padX={4} gap={2} active={selected === null} onClick={() => onSelect(null)}
        {...dnd(null, () => ({ at: "into", parent: undefined }))}
        style={{ alignItems: "center", fontWeight: 600, ...marker(undefined) }}>
        {twisty(OUTLINE_ROOT, doc.widgets.length > 0)}
        Scene
      </ListRow>
      {rootOpen && (rows.length ? rows : <div style={{ padding: "4px 8px 4px 30px", color: p.dimText }}>No widgets yet.</div>)}
    </div>
  );
}
