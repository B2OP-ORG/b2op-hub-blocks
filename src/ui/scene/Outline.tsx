import { ArrowDown, ArrowUp } from "lucide-react";
import { KIND_LABEL, isContainer, type SceneDoc } from "../../scene/model";
import { isOutside } from "../../scene/geometry";
import { usePalette } from "../theme";
import { IconButton } from "../components/IconButton";
import { ListRow } from "../components/ListRow";

/** Widget tree on the left of the scene editor; reorder the selected widget. */
export function Outline({ doc, selected, onSelect, onMove }: {
  doc: SceneDoc;
  selected: string | null;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, dir: -1 | 1) => void;
}) {
  const p = usePalette();
  const rows: React.ReactNode[] = [];
  const visit = (parent: string | undefined, depth: number) => {
    for (const w of doc.widgets.filter((x) => x.parent === parent)) {
      const isSel = w.uid === selected;
      const off = isOutside(doc, w);
      rows.push(
        <ListRow key={w.uid} depth={depth} padY={2} padX={6} gap={4} active={isSel} onClick={() => onSelect(w.uid)}
          style={{ alignItems: "center", opacity: w.hidden ? 0.6 : 1 }}>
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
      if (isContainer(w.kind)) visit(w.uid, depth + 1);
    }
  };
  visit(undefined, 0);
  return (
    <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${p.border}`, background: p.panelBg, overflowY: "auto", fontSize: 12 }}>
      <div onClick={() => onSelect(null)} style={{ padding: "6px 8px", fontWeight: 600, cursor: "pointer", background: selected === null ? p.activeBg : undefined }}>Scene</div>
      {rows.length ? rows : <div style={{ padding: "4px 8px", color: p.dimText }}>No widgets yet.</div>}
    </div>
  );
}
