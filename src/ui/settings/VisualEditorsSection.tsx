import { ChevronLeft, ChevronRight, Columns2, Rows2 } from "lucide-react";
import { useApp } from "../../state/store";
import {
  DEFAULT_PANEL_LAYOUT, PANEL_TOOL_LABEL, flattenLayout, moveTool, parsePanelLayout, serializePanelLayout, toggleStacked,
  type LayoutItem, type PanelLayout, type PanelTool,
} from "../../settings/panelLayout";
import { usePalette } from "../theme";
import { IconButton } from "../components/IconButton";
import { GroupTitle, Note } from "./settingsFields";

const label = (i: LayoutItem) => (i === "canvas" ? "Canvas" : PANEL_TOOL_LABEL[i]);

/** Settings › Scene & remote: where the outline, properties and palette sit around the canvas. */
export function VisualEditorsSection() {
  const p = usePalette();
  const layoutStr = useApp((s) => s.editorSettings.panelLayout);
  const update = useApp((s) => s.updateEditorSettings);
  const layout = parsePanelLayout(layoutStr);
  const flat = flattenLayout(layout);
  const set = (l: PanelLayout) => update({ panelLayout: serializePanelLayout(l) });

  const box: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 2, padding: "4px 4px 4px 8px", borderRadius: 6,
    border: `1px solid ${p.border}`, background: p.panelBg, fontSize: 12, whiteSpace: "nowrap",
  };

  return (
    <>
      <GroupTitle onReset={() => update({ panelLayout: DEFAULT_PANEL_LAYOUT })}>Panel layout</GroupTitle>
      <Note>
        Where the scene and remote editors put their tools, left to right. Use the arrows to move a tool (also past the canvas);
        click the button between two neighbouring tools to stack them in one panel or give each its own panel.
        The remote editor has no outline.
      </Note>

      {/* Editor: items in screen order, join toggles between neighbouring tools */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 0" }}>
        {flat.map((f, i) => {
          const prev = flat[i - 1];
          const joiner = i > 0 && f.item !== "canvas" && prev.item !== "canvas";
          return (
            <div key={f.item} style={{ display: "contents" }}>
              {joiner && (
                <IconButton variant="subtle" onClick={() => set(toggleStacked(layout, i))}
                  title={f.stacked ? `${label(prev.item)} and ${label(f.item)} share a panel (stacked) — click to split` : `${label(prev.item)} and ${label(f.item)} have their own panels — click to stack them`}
                  style={{ border: `1px solid ${p.border}`, color: f.stacked ? p.accent : p.dimText }}>
                  {f.stacked ? <Rows2 size={14} /> : <Columns2 size={14} />}
                </IconButton>
              )}
              {f.item === "canvas" ? (
                <div style={{ ...box, padding: "4px 16px", borderStyle: "dashed", color: p.dimText }}>Canvas</div>
              ) : (
                <div style={box}>
                  {label(f.item)}
                  <IconButton variant="subtle" title={`Move ${label(f.item)} left`} disabled={i === 0} onClick={() => set(moveTool(layout, f.item as PanelTool, -1))}><ChevronLeft size={14} /></IconButton>
                  <IconButton variant="subtle" title={`Move ${label(f.item)} right`} disabled={i === flat.length - 1} onClick={() => set(moveTool(layout, f.item as PanelTool, 1))}><ChevronRight size={14} /></IconButton>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview of the resulting layout */}
      <div style={{ display: "flex", gap: 4, height: 110, maxWidth: 420, padding: 4, borderRadius: 6, border: `1px solid ${p.border}`, background: p.panelAltBg }}>
        {layout.map((col) => (
          <div key={col.join("-")} style={{ flex: col[0] === "canvas" ? 2.5 : 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {col.map((item) => (
              <div key={item} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, fontSize: 11, overflow: "hidden",
                border: `1px ${item === "canvas" ? "dashed" : "solid"} ${p.border}`,
                background: item === "canvas" ? "transparent" : p.panelBg, color: item === "canvas" ? p.dimText : p.text,
              }}>
                {label(item)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: p.dimText, marginTop: 6 }}>
        <code>{layoutStr}</code>
      </div>
    </>
  );
}
