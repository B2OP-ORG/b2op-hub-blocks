import { useApp } from "../../state/store";
import { DEFAULT_EDITOR_SETTINGS } from "../../settings/editorSettings";
import { GroupTitle, Row, Toggle } from "./settingsFields";

export function BlocksSection() {
  const settings = useApp((s) => s.editorSettings);
  const update = useApp((s) => s.updateEditorSettings);
  return (
    <>
      <GroupTitle onReset={() => update({ showAdvanced: DEFAULT_EDITOR_SETTINGS.showAdvanced, toolboxBlockScale: DEFAULT_EDITOR_SETTINGS.toolboxBlockScale })}>Toolbox</GroupTitle>
      <Row label="Show advanced blocks" help="Adds low-level hub and motor blocks to the toolbox.">
        <Toggle label="Show advanced blocks" checked={settings.showAdvanced} onChange={(v) => update({ showAdvanced: v })} />
      </Row>
      <Row label="Toolbox block size">
        <input type="range" min={0.5} max={1.5} step={0.05} value={settings.toolboxBlockScale} onChange={(e) => update({ toolboxBlockScale: Number(e.target.value) })} style={{ flex: 1, minWidth: 0 }} />
        <span style={{ width: 44, textAlign: "right", fontSize: 12 }}>{settings.toolboxBlockScale.toFixed(2)}×</span>
      </Row>
    </>
  );
}
