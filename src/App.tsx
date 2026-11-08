import { lazy, Suspense, useEffect, useState } from "react";
import { Header } from "./ui/Header";
import { TabBar } from "./ui/TabBar";
import { Sidebar } from "./ui/sidebar/Sidebar";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Workspace } from "./ui/Workspace";
import { SettingsModal } from "./ui/SettingsModal";
import { FirmwareUpdatePrompt } from "./ui/FirmwareUpdatePrompt";
import { ContextMenuHost } from "./ui/ContextMenu";
import { DialogHost } from "./ui/Dialog";
import { TransferOverlay } from "./ui/TransferOverlay";
import { useApp } from "./state/store";
import { loadWorkspace } from "./project/storage";
import { usePalette } from "./ui/theme";
import boardVersions from "./device/boardVersions.json";
import { isNewer, isDevBuild } from "./device/fwVersion";

const FirmwareUpdatePage = lazy(() => import("./ui/FirmwareUpdatePage").then((m) => ({ default: m.FirmwareUpdatePage })));

const SUPPRESS_KEY = "b2op.suppressFwUpdates";

// Restore projects before the first render so nothing flashes the default project.
(() => {
  const loaded = loadWorkspace();
  if (loaded) {
    const mfp = loaded.active;
    const ids = new Set(mfp.files.map((f) => f.id));
    const openFileIds = mfp.openFileIds.filter((id) => ids.has(id));
    const activeFileId = ids.has(mfp.activeFileId) ? mfp.activeFileId : (openFileIds[0] ?? "");
    useApp.setState({ projects: loaded.projects, mfp, openFileIds, activeFileId });
    // Recompute the derived editor state via a no-op open.
    if (activeFileId) useApp.getState().openFile(activeFileId);
    else useApp.getState().closeAllFiles();
  } else {
    useApp.getState().persist();
  }
})();

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showUpdatePage, setShowUpdatePage] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ latestFw: string } | null>(null);
  const project = useApp((s) => s.project);
  const activeFileId = useApp((s) => s.activeFileId);
  const projectId = useApp((s) => s.mfp.id);
  const connection = useApp((s) => s.connection);
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);
  const fwVersion = useApp((s) => s.fwVersion);
  const p = usePalette();

  // Autosave the active project when it changed (every 2s, on hide and on unload).
  useEffect(() => {
    let last = useApp.getState().mfp;
    let lastOpen = useApp.getState().openFileIds;
    let lastActive = useApp.getState().activeFileId;
    const save = () => {
      const s = useApp.getState();
      if (s.mfp === last && s.openFileIds === lastOpen && s.activeFileId === lastActive) return;
      s.persist();
      last = useApp.getState().mfp;
      lastOpen = s.openFileIds;
      lastActive = s.activeFileId;
    };
    const id = setInterval(save, 2000);
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    setUpdateInfo(null);
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

  return (
    <ErrorBoundary>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: p.appBg, color: p.text, colorScheme: p.dark ? "dark" : "light" }}>
        <Header
          onOpenSettings={() => setShowSettings(true)}
          onOpenFwUpdate={updateInfo ? () => setShowUpdatePrompt(true) : undefined}
          onOpenFwUpdater={() => setShowUpdatePage(true)}
          latestFw={updateInfo?.latestFw}
        />
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <SidebarSlot />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", order: 1 }}>
            <TabBar />
            <div style={{ flex: 1, minHeight: 0 }}>
              <ErrorBoundary>
                <Workspace key={projectId + ":" + activeFileId + ":" + project.type} />
              </ErrorBoundary>
            </div>
          </div>
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
        {showUpdatePage && <Suspense fallback={null}><FirmwareUpdatePage onBack={() => setShowUpdatePage(false)} /></Suspense>}
        <TransferOverlay />
        <DialogHost />
        <ContextMenuHost />
      </div>
    </ErrorBoundary>
  );
}

/** Sidebar placed before or after the editor column per settings. */
function SidebarSlot() {
  const side = useApp((s) => s.editorSettings.sidebar.side);
  return (
    <div style={{ display: "flex", minHeight: 0, order: side === "left" ? 0 : 2 }}>
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
    </div>
  );
}
