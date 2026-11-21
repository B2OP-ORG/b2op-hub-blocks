import { useState } from "react";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { SECTIONS, type Section } from "./constants";
import { BlocksSection } from "./BlocksSection";
import { CodeEditorSection } from "./CodeEditorSection";
import { DeviceSection } from "./DeviceSection";
import { GeneralSection } from "./GeneralSection";
import { LspSection } from "./LspSection";
import { RunSection } from "./RunSection";
import { SettingsNav } from "./SettingsNav";
import { SidebarSection } from "./SidebarSection";

const SECTION_VIEWS: Record<Section, () => React.ReactNode> = {
  general: GeneralSection,
  sidebar: SidebarSection,
  blocks: BlocksSection,
  code: CodeEditorSection,
  lsp: LspSection,
  device: DeviceSection,
  run: RunSection,
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const p = usePalette();
  const [section, setSection] = useState<Section>("general");
  const Body = SECTION_VIEWS[section];

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Settings"
      cardStyle={{ width: "min(820px, 96vw)", height: "min(640px, 92vh)", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${p.border}` }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17 }}>Settings</h3>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SettingsNav section={section} onSelect={setSection} />
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", minWidth: 0 }}>
          <h4 style={{ margin: "16px 0 0", fontSize: 15 }}>{SECTIONS.find((s) => s.id === section)?.label}</h4>
          <Body />
        </div>
      </div>
    </Modal>
  );
}
