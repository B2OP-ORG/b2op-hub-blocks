import { useApp } from "../../state/store";
import { DEFAULT_AUTO_RELOAD, type AutoReloadRule, type AutoReloadSettings } from "../../settings/editorSettings";
import { RELOAD_KINDS, RELOAD_MODES } from "./constants";
import { GroupTitle, Note, NumberInput, Row, Select } from "./settingsFields";

export function RunSection() {
  const ar = useApp((s) => s.editorSettings.autoReload);
  const update = useApp((s) => s.updateEditorSettings);
  const setRule = (kind: keyof AutoReloadSettings, patch: Partial<AutoReloadRule>) =>
    update({ autoReload: { ...ar, [kind]: { ...ar[kind], ...patch } } });
  return (
    <>
      <Note>
        <b>Reload</b> in the top bar stops the running program, uploads changed files and runs the last program again.
        While a program runs, the remote controller is live; it goes back to edit mode when the program ends.
      </Note>
      <GroupTitle onReset={() => update({ autoReload: DEFAULT_AUTO_RELOAD })}>Auto-reload on change</GroupTitle>
      <Note pad="2px 0 4px">
        Reload the running program when you change a project file. <i>When leaving the editor</i> reloads once you click outside the
        editor, switch to another file tab or switch to another window.
      </Note>
      {RELOAD_KINDS.map(({ kind, label, help }) => (
        <Row key={kind} label={label} help={help}>
          <Select value={ar[kind].mode} options={RELOAD_MODES} onChange={(v) => setRule(kind, { mode: v })} />
          {ar[kind].mode === "delay" && (
            <NumberInput value={ar[kind].delaySec} min={0} max={60} step={0.5} onChange={(v) => setRule(kind, { delaySec: v })} suffix="s" />
          )}
        </Row>
      ))}
    </>
  );
}
