import { lazy, Suspense, useEffect, useState } from "react";
import { Header } from "./ui/Header";
import { TabBar } from "./ui/TabBar";
import { FileBrowser } from "./ui/FileBrowser";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Workspace } from "./ui/Workspace";
import { SettingsModal } from "./ui/SettingsModal";
import { FirmwareUpdatePrompt } from "./ui/FirmwareUpdatePrompt";
import { useApp } from "./state/store";
import { loadMultiFileProject, saveMultiFileProject } from "./project/storage";
import { fileToProject } from "./project/format";
import boardVersions from "./device/boardVersions.json";
import { isNewer, isDevBuild } from "./device/fwVersion";

const FirmwareUpdatePage = lazy(() => import("./ui/FirmwareUpdatePage").then((m) => ({ default: m.FirmwareUpdatePage })));

const SUPPRESS_KEY = "b2op.suppressFwUpdates";

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showUpdatePage, setShowUpdatePage] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ latestFw: string } | null>(null);
  const project = useApp((s) => s.project);
  const activeFileId = useApp((s) => s.activeFileId);
  const connection = useApp((s) => s.connection);
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);
  const fwVersion = useApp((s) => s.fwVersion);

  useEffect(() => {
    const loaded = loadMultiFileProject();
    if (loaded) {
      const activeFile = loaded.mfp.files.find((x) => x.id === loaded.activeFileId) ?? loaded.mfp.files[0];
      useApp.setState({
        mfp: loaded.mfp,
        openFileIds: loaded.openFileIds,
        activeFileId: loaded.activeFileId,
        savedSnapshot: JSON.stringify(loaded.mfp),
        project: fileToProject(activeFile, loaded.mfp.settings, loaded.mfp.createdAt),
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      const s = useApp.getState();
      saveMultiFileProject(s.mfp, s.openFileIds, s.activeFileId);
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
      if (JSON.stringify(s.mfp) !== s.savedSnapshot) {
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
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <FileBrowser />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <TabBar />
            <div style={{ flex: 1, minHeight: 0 }}>
              <ErrorBoundary>
                <Workspace key={activeFileId + ":" + project.type} />
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
      </div>
    </ErrorBoundary>
  );
}
