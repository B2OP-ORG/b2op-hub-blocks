import { useApp } from "../../state/store";
import { DEFAULT_SIDEBAR_SETTINGS, SIDEBAR_TAB_IDS } from "../../settings/editorSettings";
import { DEFAULT_SIDEBAR_WIDTH } from "../../settings/storage";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { TAB_LABELS } from "./constants";
import { GroupTitle, Row, Select } from "./settingsFields";

export function SidebarSection() {
  const p = usePalette();
  const sb = useApp((s) => s.editorSettings.sidebar);
  const update = useApp((s) => s.updateEditorSettings);
  const setSidebarWidth = useApp((s) => s.setSidebarWidth);
  return (
    <>
      <GroupTitle onReset={() => { update({ sidebar: DEFAULT_SIDEBAR_SETTINGS }); setSidebarWidth(DEFAULT_SIDEBAR_WIDTH); }}>Layout</GroupTitle>
      <Row label="Position">
        <Select value={sb.side} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} onChange={(v) => update({ sidebar: { ...sb, side: v } })} />
      </Row>
      <Row label="Width" help="You can also drag the sidebar's edge; double-click it to reset.">
        <Button onClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}>Reset width</Button>
      </Row>
      <GroupTitle>Visible tabs</GroupTitle>
      {SIDEBAR_TAB_IDS.map((t) => {
        const shown = !sb.hiddenTabs.includes(t);
        const lastShown = shown && SIDEBAR_TAB_IDS.filter((x) => !sb.hiddenTabs.includes(x)).length === 1;
        return (
          <Row key={t} label={TAB_LABELS[t]} help={lastShown ? "At least one tab must stay visible." : undefined}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: lastShown ? "default" : "pointer" }}>
              <input
                type="checkbox"
                checked={shown}
                disabled={lastShown}
                onChange={(e) => update({ sidebar: { ...sb, hiddenTabs: e.target.checked ? sb.hiddenTabs.filter((x) => x !== t) : [...sb.hiddenTabs, t] } })}
              />
              {shown ? "Shown" : "Hidden"}
            </label>
          </Row>
        );
      })}
      <div style={{ fontSize: 11, color: p.dimText, marginTop: 8 }}>Right-click the sidebar's icon strip to reorder tabs.</div>
    </>
  );
}
