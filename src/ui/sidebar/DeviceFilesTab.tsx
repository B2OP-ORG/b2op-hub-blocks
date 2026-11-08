import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp, Copy, Download, File, FileInput, Folder, FolderInput, FolderPlus, Move, Pencil, Play, RefreshCw, Trash2, Upload,
} from "lucide-react";
import { useApp } from "../../state/store";
import type { DirEntry } from "../../device/protocol";
import { devJoin, devParent } from "../../project/paths";
import { CancelledError, runDevicePath, uploadWithProgress } from "../../project/deviceSync";
import { pickFiles } from "../../project/download";
import { downloadBytes } from "../../project/zip";
import { openContextMenu, type MenuItem } from "../ContextMenu";
import { usePalette } from "../theme";
import { showAlert, showConfirm, showPrompt } from "../Dialog";
import {
  loadDeviceDirAsProject, loadDeviceFileIntoPickedProject, loadDeviceFileIntoProject, readDeviceFile,
} from "../actions";
import { EmptyNote, IconButton, InlineInput, PanelHeader, wrapText } from "./common";

function crumbs(cwd: string): { label: string; path: string }[] {
  const out = [{ label: "/", path: "/" }];
  let acc = "";
  for (const part of cwd.split("/").filter(Boolean)) {
    acc += "/" + part;
    out.push({ label: part, path: acc });
  }
  return out;
}

export function DeviceFilesTab({ active }: { active: boolean }) {
  const p = usePalette();
  const device = useApp((s) => s.device);
  const running = useApp((s) => s.running);
  const allowRoot = useApp((s) => s.editorSettings.allowRoot);
  const projectId = useApp((s) => s.mfp.id);
  const projectTitle = useApp((s) => s.mfp.title);
  const appendConsole = useApp((s) => s.appendConsole);

  const [cwd, setCwd] = useState("/sd");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);

  const minRoot = allowRoot ? "/" : "/sd";

  const refresh = useCallback(async (path = cwd) => {
    if (!device) return;
    setLoading(true);
    setError(null);
    try {
      const result = await device.ls(path);
      result.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })));
      setEntries(result);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [device, cwd]);

  // Load when the tab is shown, the path changes, or a hub connects.
  useEffect(() => {
    if (active && device) void refresh(cwd);
  }, [active, device, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!allowRoot && !cwd.startsWith("/sd")) setCwd("/sd");
  }, [allowRoot, cwd]);

  /** Run a device operation with busy state + error popup, then refresh. */
  const op = async (label: string, fn: () => Promise<void>, refreshAfter = true) => {
    setBusy(true);
    try {
      await fn();
      if (refreshAfter) await refresh();
    } catch (e) {
      if (e instanceof CancelledError || (e as Error).message === "Cancelled") {
        appendConsole("info", `[${label} cancelled]\n`);
      } else {
        appendConsole("err", `[${label} failed: ${(e as Error).message}]\n`);
        await showAlert(`Couldn't ${label}`, (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const commitRename = () => {
    const r = renaming;
    setRenaming(null);
    if (!device || !r || !r.value.trim() || r.value.trim() === r.name) return;
    void op("rename", () => device.mv(devJoin(cwd, r.name), devJoin(cwd, r.value.trim())));
  };

  const copyOrMove = async (kind: "copy" | "move", name: string) => {
    if (!device) return;
    const src = devJoin(cwd, name);
    const dst = await showPrompt(kind === "copy" ? `Copy "${name}" to` : `Move "${name}" to`, src, {
      confirmLabel: kind === "copy" ? "Copy" : "Move",
      validate: (v) => (v.trim().startsWith("/") ? null : "Enter an absolute path, e.g. /sd/folder/file.py"),
    });
    if (!dst || dst === src) return;
    await op(kind, () => (kind === "copy" ? device.cp(src, dst) : device.mv(src, dst)));
  };

  const remove = async (e: DirEntry) => {
    if (!device) return;
    const path = devJoin(cwd, e.name);
    const ok = await showConfirm(`Delete "${path}"?`, `This deletes the ${e.isDir ? "folder" : "file"} from the hub's SD card. This can't be undone.`, { confirmLabel: "Delete", danger: true });
    if (ok) await op("delete", () => device.rm(path));
  };

  const download = (name: string) => op("download", async () => {
    const bytes = await readDeviceFile(devJoin(cwd, name));
    downloadBytes(bytes, name);
  }, false);

  const uploadFromComputer = async () => {
    if (!device) return;
    const files = await pickFiles("");
    if (files.length === 0) return;
    await op("upload", async () => {
      const startedAt = Date.now();
      let i = 0;
      try {
        for (const file of files) {
          i++;
          const path = devJoin(cwd, file.name);
          const bytes = new Uint8Array(await file.arrayBuffer());
          await uploadWithProgress(device, path, bytes, `Uploading ${file.name}…`, { allowRoot, fileIndex: i, fileCount: files.length, startedAt });
          appendConsole("info", `[upload → ${path} (${bytes.length}B)]\n`);
        }
      } finally {
        useApp.getState().setTransfer(null);
      }
    });
  };

  const newFolder = async () => {
    if (!device) return;
    const name = await showPrompt("New folder", "folder", { validate: (v) => (v.trim() && !v.includes("/") ? null : "Enter a folder name without slashes.") });
    if (!name) return;
    await op("create folder", async () => {
      try {
        await device.mkdir(devJoin(cwd, name));
      } catch (e) {
        if (/unknown kind/i.test((e as Error).message)) throw new Error("The hub firmware doesn't support creating folders (MKDIR). Update the firmware.");
        throw e;
      }
    });
  };

  const disabled = !device || busy || running;
  const hint = running ? "program running" : undefined;

  const backgroundItems: MenuItem[] = [
    { label: "Upload files from computer…", icon: <Upload size={13} />, disabled, hint, onSelect: uploadFromComputer },
    { label: "New folder…", icon: <FolderPlus size={13} />, disabled, hint, onSelect: newFolder },
    { label: "Load this folder as project", icon: <FolderInput size={13} />, disabled, hint, onSelect: () => op("load folder", () => loadDeviceDirAsProject(cwd), false) },
    "separator",
    { label: "Refresh", icon: <RefreshCw size={13} />, disabled: !device || busy, onSelect: () => void refresh() },
  ];

  const entryMenu = (ev: React.MouseEvent, e: DirEntry) => {
    const path = devJoin(cwd, e.name);
    const common: MenuItem[] = [
      "separator",
      { label: "Rename", icon: <Pencil size={13} />, disabled, hint, onSelect: () => setRenaming({ name: e.name, value: e.name }) },
      { label: "Copy to…", icon: <Copy size={13} />, disabled, hint, onSelect: () => copyOrMove("copy", e.name) },
      { label: "Move to…", icon: <Move size={13} />, disabled, hint, onSelect: () => copyOrMove("move", e.name) },
      "separator",
      { label: "Delete", icon: <Trash2 size={13} />, danger: true, disabled, hint, onSelect: () => remove(e) },
    ];
    if (e.isDir) {
      openContextMenu(ev, [
        { label: "Open", icon: <Folder size={13} />, onSelect: () => setCwd(path) },
        { label: "Load as project", icon: <FolderInput size={13} />, disabled, hint, onSelect: () => op("load folder", () => loadDeviceDirAsProject(path), false) },
        ...common,
      ]);
    } else {
      openContextMenu(ev, [
        { label: `Load into "${projectTitle}"`, icon: <FileInput size={13} />, disabled, hint, onSelect: () => op("load file", () => loadDeviceFileIntoProject(path, projectId), false) },
        { label: "Load into project…", icon: <FileInput size={13} />, disabled, hint, onSelect: () => op("load file", () => loadDeviceFileIntoPickedProject(path), false) },
        { label: "Run", icon: <Play size={13} />, disabled, hint, onSelect: () => runDevicePath(path) },
        { label: "Download to computer", icon: <Download size={13} />, disabled, hint, onSelect: () => download(e.name) },
        ...common,
      ]);
    }
  };

  if (!device) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <PanelHeader title="SD card" />
        <EmptyNote>Connect a hub to browse its SD card.</EmptyNote>
      </div>
    );
  }

  const path = crumbs(cwd);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="SD card">
        <IconButton title="Up" disabled={cwd === minRoot || cwd === "/" || busy} onClick={() => setCwd(devParent(cwd))}><ArrowUp size={14} /></IconButton>
        <IconButton title="Refresh" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={14} /></IconButton>
      </PanelHeader>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, padding: "4px 10px", borderBottom: `1px solid ${p.border}`, fontSize: 12 }}>
        {path.map((c, i) => {
          const allowed = allowRoot || c.path.startsWith("/sd");
          return (
            <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              {i > 1 && <span style={{ opacity: 0.4 }}>/</span>}
              <button
                type="button"
                disabled={!allowed || busy}
                onClick={() => setCwd(c.path)}
                style={{
                  background: "none", border: "none", padding: "1px 3px", borderRadius: 3, color: p.text,
                  fontWeight: i === path.length - 1 ? 700 : 400, cursor: allowed ? "pointer" : "default",
                  opacity: allowed ? 1 : 0.45, fontSize: 12, overflowWrap: "anywhere", textAlign: "left",
                }}
              >
                {c.label}
              </button>
            </span>
          );
        })}
      </div>
      {error && <div style={{ padding: "6px 10px", color: p.danger, fontSize: 12, overflowWrap: "anywhere" }}>{error}</div>}
      <div
        style={{ flex: 1, overflowY: "auto", paddingBottom: 24, opacity: busy ? 0.6 : 1 }}
        onContextMenu={(e) => openContextMenu(e, backgroundItems)}
      >
        {loading && entries.length === 0 && <EmptyNote>Loading…</EmptyNote>}
        {!loading && !error && entries.length === 0 && <EmptyNote>Empty folder. Right-click to upload files or create a folder.</EmptyNote>}
        {entries.map((e) => {
          const isRenaming = renaming?.name === e.name;
          return (
            <div
              key={e.name}
              title={devJoin(cwd, e.name)}
              style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 10px", cursor: "pointer", userSelect: "none" }}
              onClick={() => { if (e.isDir) setCwd(devJoin(cwd, e.name)); }}
              onDoubleClick={() => { if (!e.isDir && !disabled) void op("load file", () => loadDeviceFileIntoProject(devJoin(cwd, e.name), projectId), false); }}
              onContextMenu={(ev) => entryMenu(ev, e)}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = p.hoverBg; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", height: 16, color: e.isDir ? "#d97706" : p.dimText, flexShrink: 0 }}>
                {e.isDir ? <Folder size={13} /> : <File size={13} />}
              </span>
              {isRenaming
                ? <InlineInput value={renaming.value} onChange={(v) => setRenaming({ ...renaming, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} />
                : <span style={{ ...wrapText, fontWeight: e.isDir ? 600 : 400 }}>{e.name}</span>}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "4px 10px", borderTop: `1px solid ${p.border}`, fontSize: 11, color: p.dimText }}>
        Double-click a file to load it into the open project · right-click for more
      </div>
    </div>
  );
}

