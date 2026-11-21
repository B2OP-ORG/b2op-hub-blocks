import { useApp } from "../../state/store";
import { GroupTitle, Note, Row, Toggle } from "./settingsFields";

export function DeviceSection() {
  const settings = useApp((s) => s.editorSettings);
  const update = useApp((s) => s.updateEditorSettings);
  const device = useApp((s) => s.device);
  return (
    <>
      <GroupTitle>Uploads</GroupTitle>
      <Note>
        Projects upload to <code>/sd/&lt;project-name&gt;/</code> on the hub. Upload and Run only send files that changed since the last upload
        (right-click Upload for "Upload all"). Run starts the project's <code>main.py</code>.
      </Note>
      <GroupTitle>File system access</GroupTitle>
      <Row label="Allow access outside /sd/" help={<>Lets the SD card tab browse and upload to <code>/</code>. <code>/main.py</code>, <code>/boot.py</code>, <code>/boot.mpy</code> and <code>/runner.py</code> are always protected.</>}>
        <Toggle label="Allow root filesystem access" checked={settings.allowRoot} onChange={(v) => update({ allowRoot: v })} />
      </Row>
      <GroupTitle>Debugging</GroupTitle>
      <Row label="Echo BLE traffic over USB" help={<>When connected over USB, the hub copies every frame on its Bluetooth link to USB, and the console shows them as <code>[BLE …]</code> lines.</>}>
        <Toggle
          label="Echo BLE traffic over USB"
          checked={settings.bleEchoOverUsb}
          onChange={(v) => {
            update({ bleEchoOverUsb: v });
            device?.setBleEcho(v).catch(() => { /* not connected over USB / old firmware */ });
          }}
        />
      </Row>
    </>
  );
}
