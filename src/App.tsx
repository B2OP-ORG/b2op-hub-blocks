import { useEffect, useState } from "react";
import { Header } from "./ui/Header";
import { TabBar } from "./ui/TabBar";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Workspace } from "./ui/Workspace";
import { SettingsModal } from "./ui/SettingsModal";
import { FirmwareUpdatePrompt } from "./ui/FirmwareUpdatePrompt";
import { FirmwareUpdatePage } from "./ui/FirmwareUpdatePage";
import { useApp } from "./state/store";
import { loadSavedTabs, saveTabs } from "./project/storage";
import boardVersions from "./device/boardVersions.json";
import { isNewer, isDevBuild } from "./device/fwVersion";

const SUPPRESS_KEY = "b2op.suppressFwUpdates";

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showUpdatePage, setShowUpdatePage] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ latestFw: string } | null>(null);
  const project = useApp((s) => s.project);
  const activeTabId = useApp((s) => s.activeTabId);
  const connection = useApp((s) => s.connection);
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);
  const fwVersion = useApp((s) => s.fwVersion);

  useEffect(() => {
    const saved = loadSavedTabs();
    if (saved) {
      useApp.setState({
        tabs: saved.tabs,
        activeTabId: saved.activeTabId,
        project: saved.tabs.find((t) => t.id === saved.activeTabId)?.project ?? saved.tabs[0].project,
        pythonPreview: saved.tabs.find((t) => t.id === saved.activeTabId)?.pythonPreview ?? "",
        savedSnapshot: saved.tabs.find((t) => t.id === saved.activeTabId)?.savedSnapshot ?? "",
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      const s = useApp.getState();
      saveTabs(s.tabs, s.activeTabId);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (connection !== "connected" || !boardName || !boardVersion || !fwVersion) return;
    if (isDevBuild(fwVersion)) return;
    const entry = (boardVersions as Record<string, Record<string, { latestFwVersion: string }>>)[boardName]?.[boardVersion];
    if (!entry) return;
    const { latestFwVersion } = entry;
    if (!isNewer(latestFwVersion, fwVersion)) return;
    setUpdateInfo({ latestFw: latestFwVersion });
    if (localStorage.getItem(SUPPRESS_KEY) !== "true") {
      setShowUpdatePrompt(true);
    }
  }, [connection, boardName, boardVersion, fwVersion]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const s = useApp.getState();
      const anyUnsaved = s.tabs.some((t) => t.savedSnapshot !== JSON.stringify(t.project));
      if (anyUnsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <ErrorBoundary>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: project.type === "python" ? "#06090b" : "#eaf4f7" }}>
        <Header
          onOpenSettings={() => setShowSettings(true)}
          onOpenFwUpdate={updateInfo ? () => setShowUpdatePrompt(true) : undefined}
        />
        <TabBar />
        <div style={{ flex: 1, minHeight: 0 }}>
          <ErrorBoundary>
            <Workspace key={activeTabId + ":" + project.type} />
          </ErrorBoundary>
        </div>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showUpdatePrompt && updateInfo && (
          <FirmwareUpdatePrompt
            boardName={boardName}
            boardVersion={boardVersion}
            currentFw={fwVersion}
            latestFw={updateInfo.latestFw}
            onUpdate={() => { setShowUpdatePrompt(false); setShowUpdatePage(true); }}
            onDismiss={(doNotShowAgain) => {
              if (doNotShowAgain) {
                localStorage.setItem(SUPPRESS_KEY, "true");
              }
              setShowUpdatePrompt(false);
            }}
          />
        )}
        {showUpdatePage && <FirmwareUpdatePage onBack={() => setShowUpdatePage(false)} />}
      </div>
    </ErrorBoundary>
  );
}
