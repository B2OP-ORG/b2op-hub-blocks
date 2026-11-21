import { useState } from "react";
import { useApp } from "../../state/store";
import { FW_KEY } from "./constants";
import { GroupTitle, Row, Toggle } from "./settingsFields";

export function GeneralSection() {
  const settings = useApp((s) => s.editorSettings);
  const update = useApp((s) => s.updateEditorSettings);
  const [fwNotifs, setFwNotifs] = useState(() => {
    try { return localStorage.getItem(FW_KEY) !== "true"; } catch { return true; }
  });
  return (
    <>
      <GroupTitle>Appearance</GroupTitle>
      <Row label="Dark mode" help="Applies to the whole app, including the code editor.">
        <Toggle label="Dark mode" checked={settings.darkMode} onChange={(v) => update({ darkMode: v })} />
      </Row>
      <GroupTitle>Notifications</GroupTitle>
      <Row label="Firmware update notifications" help="Prompt when the connected hub runs older firmware than the latest release.">
        <Toggle
          label="Firmware update notifications"
          checked={fwNotifs}
          onChange={(v) => {
            setFwNotifs(v);
            try { if (v) localStorage.removeItem(FW_KEY); else localStorage.setItem(FW_KEY, "true"); } catch { /* ignore */ }
          }}
        />
      </Row>
    </>
  );
}
