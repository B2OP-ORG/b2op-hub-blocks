import { useEffect, useState } from "react";
import { Header } from "./ui/Header";
import { TabBar } from "./ui/TabBar";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Workspace } from "./ui/Workspace";
import { SettingsModal } from "./ui/SettingsModal";
import { useApp } from "./state/store";
import { loadSavedTabs, saveTabs } from "./project/storage";

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const project = useApp((s) => s.project);
  const activeTabId = useApp((s) => s.activeTabId);

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
        <Header onOpenSettings={() => setShowSettings(true)} />
        <TabBar />
        <div style={{ flex: 1, minHeight: 0 }}>
          <ErrorBoundary>
            <Workspace key={activeTabId + ":" + project.type} />
          </ErrorBoundary>
        </div>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </ErrorBoundary>
  );
}
