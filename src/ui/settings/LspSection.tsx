import { useApp } from "../../state/store";
import { DEFAULT_EDITOR_SETTINGS, type LspMode } from "../../settings/editorSettings";
import { GroupTitle, Row, Select, TextInput } from "./settingsFields";

export function LspSection() {
  const settings = useApp((s) => s.editorSettings);
  const update = useApp((s) => s.updateEditorSettings);
  return (
    <>
      <GroupTitle onReset={() => update({ lspMode: DEFAULT_EDITOR_SETTINGS.lspMode, lspRemoteUrl: DEFAULT_EDITOR_SETTINGS.lspRemoteUrl })}>Language server</GroupTitle>
      <Row label="Mode" help="Provides completion, hover info, signature help and error checking in the Python editor.">
        <Select<LspMode> value={settings.lspMode} options={[{ value: "worker", label: "In the browser (Pyright)" }, { value: "remote", label: "Remote server (WebSocket)" }, { value: "off", label: "Off" }]} onChange={(v) => update({ lspMode: v })} />
      </Row>
      {settings.lspMode === "remote" && (
        <Row label="Server URL" help={<>Run the server from <code>docs/lsp-server/</code>.</>}>
          <TextInput grow value={settings.lspRemoteUrl} onChange={(v) => update({ lspRemoteUrl: v })} />
        </Row>
      )}
    </>
  );
}
