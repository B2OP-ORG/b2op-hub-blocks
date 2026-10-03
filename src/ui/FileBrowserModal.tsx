import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { newPythonProject } from "../project/format";
import type { DirEntry } from "../device/protocol";

interface Props {
  onClose: () => void;
}

// ── Transfer stats helpers ────────────────────────────────────────────────────

function fmtSpeed(bps: number): string {
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  return `~${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function joinPath(dir: string, name: string): string {
  return dir.replace(/\/$/, "") + "/" + name;
}

function parentPath(path: string): string {
  const p = path.replace(/\/$/, "");
  const idx = p.lastIndexOf("/");
  return idx <= 0 ? "/" : p.slice(0, idx);
}

function breadcrumbs(cwd: string): { label: string; path: string }[] {
  if (cwd === "/") return [{ label: "/", path: "/" }];
  const parts = cwd.replace(/\/$/, "").split("/").filter(Boolean);
  const result: { label: string; path: string }[] = [{ label: "/", path: "/" }];
  let acc = "";
  for (const part of parts) {
    acc += "/" + part;
    result.push({ label: part, path: acc });
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FileBrowserModal({ onClose }: Props) {
  const device = useApp((s) => s.device);
  const project = useApp((s) => s.project);
  const openTab = useApp((s) => s.openTab);
  const appendConsole = useApp((s) => s.appendConsole);

  const dark = project.type === "python";
  const allowRoot = project.settings.allowRoot;
  const defaultCwd = allowRoot ? "/" : "/sd";

  const [cwd, setCwd] = useState(defaultCwd);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pathDialog, setPathDialog] = useState<{
    kind: "copy" | "move";
    name: string;
    value: string;
  } | null>(null);
  const [progress, setProgress] = useState<{ label: string; sent: number; total: number } | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const transferStartRef = useRef(0);

  // ── Colours ──────────────────────────────────────────────────────────────────

  const overlayBg = dark ? "rgba(0,0,0,0.65)" : "rgba(11,59,72,0.45)";
  const modalBg = dark ? "#0b1216" : "#ffffff";
  const modalColor = dark ? "#dff5fb" : "#0b3b48";
  const modalBorder = dark ? "1px solid #164e63" : "1px solid #b6dbe4";
  const modalShadow = dark
    ? "0 10px 30px rgba(0,0,0,0.5)"
    : "0 10px 30px rgba(0,111,143,0.25)";
  const inputBg = dark ? "#111a20" : "#f6fbfd";
  const inputBorder = dark ? "#164e63" : "#b6dbe4";
  const rowHover = dark ? "#13202a" : "#eaf4f7";
  const rowSelected = dark ? "#0e3347" : "#d0edf7";
  const divider = dark ? "#164e63" : "#d6eef6";

  const btnBase: React.CSSProperties = {
    padding: "4px 9px",
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    background: dark ? "#111a20" : "#ffffff",
    color: dark ? "#dff5fb" : "#0b3b48",
    cursor: "pointer",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 500,
  };

  const primaryBtn: React.CSSProperties = {
    ...btnBase,
    background: "#0e7490",
    color: "#fff",
    border: "1px solid #155e75",
  };

  const dangerBtn: React.CSSProperties = {
    ...btnBase,
    background: dark ? "#4a1414" : "#ffe4e4",
    color: dark ? "#ffb0b0" : "#8a1c1c",
    border: dark ? "1px solid #6a1c1c" : "1px solid #f0b4b4",
  };

  const warnBtn: React.CSSProperties = {
    ...btnBase,
    background: dark ? "#3a2205" : "#fff8e4",
    color: dark ? "#ffd166" : "#7a4f00",
    border: dark ? "1px solid #5a3500" : "1px solid #f0d890",
  };

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const fetchDir = async (path: string) => {
    if (!device) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setConfirmDelete(null);
    setRenaming(null);
    setPathDialog(null);
    try {
      const result = await device.ls(path);
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(result);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDir(cwd); }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (renaming && renameInputRef.current) renameInputRef.current.focus();
  }, [renaming]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const navigate = (name: string) => {
    setCwd(joinPath(cwd, name));
  };

  const goUp = () => {
    if (cwd === "/") return;
    setCwd(parentPath(cwd));
  };

  const openInTab = async (name: string) => {
    if (!device) return;
    const fullPath = joinPath(cwd, name);
    cancelRef.current = false;
    transferStartRef.current = Date.now();
    setBusy(true);
    setProgress({ label: `Opening ${name}…`, sent: 0, total: 0 });
    try {
      const source = await device.readFile(fullPath, {
        onProgress: (sent, total) => {
          if (cancelRef.current) throw new Error("Transfer cancelled");
          setProgress({ label: `Opening ${name}…`, sent, total });
        },
      });
      const title = name.replace(/\.py$/, "");
      openTab({ ...newPythonProject(title), source }, fullPath);
      appendConsole("info", `[load ← ${fullPath} (${source.length}B)]\n`);
      onClose();
    } catch (e) {
      if ((e as Error).message === "Transfer cancelled") {
        device.stop().catch(() => {});
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadFile = async (name: string) => {
    if (!device) return;
    const fullPath = joinPath(cwd, name);
    cancelRef.current = false;
    transferStartRef.current = Date.now();
    setBusy(true);
    setProgress({ label: `Downloading ${name}…`, sent: 0, total: 0 });
    try {
      const bytes = await device.readFileRaw(fullPath, {
        onProgress: (sent, total) => {
          if (cancelRef.current) throw new Error("Transfer cancelled");
          setProgress({ label: `Downloading ${name}…`, sent, total });
        },
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error).message === "Transfer cancelled") {
        device.stop().catch(() => {});
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const uploadFromHost = () => {
    if (!device) return;
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      cancelRef.current = false;
      transferStartRef.current = Date.now();
      setBusy(true);
      const fullPath = joinPath(cwd, file.name);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setProgress({ label: `Uploading ${file.name}…`, sent: 0, total: bytes.length });
        await device.upload(fullPath, bytes, {
          policy: { allowRoot },
          onProgress: (sent, total) => {
            if (cancelRef.current) throw new Error("Transfer cancelled");
            setProgress({ label: `Uploading ${file.name}…`, sent, total });
          },
        });
        appendConsole("info", `[upload → ${fullPath} (${bytes.length}B)]\n`);
        fetchDir(cwd);
      } catch (e) {
        if ((e as Error).message === "Transfer cancelled") {
          device.stop().catch(() => {});
        } else {
          setError((e as Error).message);
        }
      } finally {
        setBusy(false);
        setProgress(null);
      }
    };
    input.click();
  };

  const startRename = (name: string) => {
    setRenaming(name);
    setRenameValue(name);
    setConfirmDelete(null);
    setPathDialog(null);
  };

  const commitRename = async () => {
    if (!device || !renaming || !renameValue.trim() || renameValue === renaming) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    const src = joinPath(cwd, renaming);
    const dst = joinPath(cwd, renameValue.trim());
    try {
      await device.mv(src, dst);
      setRenaming(null);
      fetchDir(cwd);
    } catch (e) {
      setError((e as Error).message);
      setRenaming(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (name: string) => {
    if (!device) return;
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      setRenaming(null);
      setPathDialog(null);
      return;
    }
    setBusy(true);
    try {
      await device.rm(joinPath(cwd, name));
      setConfirmDelete(null);
      if (selected === name) setSelected(null);
      fetchDir(cwd);
    } catch (e) {
      setError((e as Error).message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const openPathDialog = (kind: "copy" | "move", name: string) => {
    const src = joinPath(cwd, name);
    setPathDialog({ kind, name, value: src });
    setRenaming(null);
    setConfirmDelete(null);
  };

  const commitPathDialog = async () => {
    if (!device || !pathDialog || !pathDialog.value.trim()) return;
    setBusy(true);
    const src = joinPath(cwd, pathDialog.name);
    const dst = pathDialog.value.trim();
    try {
      if (pathDialog.kind === "copy") {
        await device.cp(src, dst);
      } else {
        await device.mv(src, dst);
      }
      setPathDialog(null);
      fetchDir(cwd);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const crumbs = breadcrumbs(cwd);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: overlayBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        style={{
          background: modalBg,
          color: modalColor,
          padding: "18px 20px 16px",
          borderRadius: 12,
          width: 580,
          maxWidth: "95vw",
          border: modalBorder,
          boxShadow: modalShadow,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15, marginRight: 4 }}>File Browser</span>
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ opacity: 0.4 }}>›</span>}
              <button
                type="button"
                style={{
                  ...btnBase,
                  padding: "2px 7px",
                  fontWeight: i === crumbs.length - 1 ? 700 : 400,
                  background: i === crumbs.length - 1
                    ? (dark ? "#163040" : "#d0edf7")
                    : (dark ? "#111a20" : "#f0f8fc"),
                }}
                onClick={() => setCwd(crumb.path)}
              >
                {crumb.label}
              </button>
            </span>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              type="button"
              style={{ ...btnBase, opacity: cwd === "/" ? 0.35 : 1 }}
              disabled={cwd === "/"}
              onClick={goUp}
              title="Go up"
            >
              ↑
            </button>
            <button type="button" style={{ ...btnBase, opacity: busy ? 0.45 : 1 }} disabled={busy} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${divider}` }} />

        {/* Path dialog (copy/move) */}
        {pathDialog && (
          <div
            style={{
              background: dark ? "#111a20" : "#f0f8fc",
              border: `1px solid ${inputBorder}`,
              borderRadius: 6,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {pathDialog.kind === "copy" ? "Copy" : "Move"} "{pathDialog.name}" to:
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={pathDialog.value}
                onChange={(e) => setPathDialog({ ...pathDialog, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPathDialog();
                  if (e.key === "Escape") setPathDialog(null);
                }}
                style={{
                  flex: 1,
                  background: inputBg,
                  color: modalColor,
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 4,
                  padding: "4px 7px",
                  fontSize: 13,
                }}
                autoFocus
              />
              <button type="button" style={primaryBtn} disabled={busy} onClick={commitPathDialog}>
                Confirm
              </button>
              <button type="button" style={btnBase} onClick={() => setPathDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* File list */}
        <div
          style={{
            overflowY: "auto",
            maxHeight: 420,
            border: `1px solid ${divider}`,
            borderRadius: 6,
          }}
        >
          {loading && (
            <div style={{ padding: "12px 14px", opacity: 0.6, fontSize: 13 }}>Loading…</div>
          )}
          {!loading && entries.length === 0 && !error && (
            <div style={{ padding: "12px 14px", opacity: 0.5, fontSize: 13 }}>(empty)</div>
          )}
          {!loading && entries.map((entry) => {
            const isSelected = selected === entry.name;
            const isRenaming = renaming === entry.name;
            const isConfirmDelete = confirmDelete === entry.name;

            return (
              <div
                key={entry.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  background: isSelected ? rowSelected : undefined,
                  cursor: "pointer",
                  borderBottom: `1px solid ${divider}`,
                  fontSize: 13,
                }}
                onClick={() => {
                  setSelected(entry.name);
                  setConfirmDelete(null);
                  if (!isRenaming) setRenaming(null);
                }}
                onDoubleClick={() => {
                  if (busy) return;
                  if (entry.isDir) navigate(entry.name);
                  else openInTab(entry.name);
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = rowHover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "";
                }}
              >
                {/* Type badge */}
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: entry.isDir
                      ? (dark ? "#1a3a4a" : "#cce9f3")
                      : (dark ? "#1a2a1a" : "#d8f0dc"),
                    color: entry.isDir
                      ? (dark ? "#7dd3fc" : "#0e7490")
                      : (dark ? "#86efac" : "#0f5e2f"),
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {entry.isDir ? "DIR" : "FILE"}
                </span>

                {/* Name or rename input */}
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: inputBg,
                      color: modalColor,
                      border: `1px solid ${inputBorder}`,
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.name}{entry.isDir ? "/" : ""}
                  </span>
                )}

                {/* Rename confirm/cancel */}
                {isRenaming && (
                  <>
                    <button type="button" style={primaryBtn} disabled={busy} onClick={(e) => { e.stopPropagation(); commitRename(); }}>✓</button>
                    <button type="button" style={btnBase} onClick={(e) => { e.stopPropagation(); setRenaming(null); }}>✗</button>
                  </>
                )}

                {/* Action buttons (not shown while renaming) */}
                {!isRenaming && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {!entry.isDir && (
                      <>
                        <button
                          type="button"
                          style={btnBase}
                          disabled={busy}
                          title="Open in new tab"
                          onClick={() => openInTab(entry.name)}
                        >
                          ↗
                        </button>
                        <button
                          type="button"
                          style={btnBase}
                          disabled={busy}
                          title="Download"
                          onClick={() => downloadFile(entry.name)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      style={btnBase}
                      disabled={busy}
                      title="Rename"
                      onClick={() => startRename(entry.name)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      style={btnBase}
                      disabled={busy}
                      title="Copy"
                      onClick={() => openPathDialog("copy", entry.name)}
                    >
                      ⎘
                    </button>
                    <button
                      type="button"
                      style={btnBase}
                      disabled={busy}
                      title="Move"
                      onClick={() => openPathDialog("move", entry.name)}
                    >
                      ⤴
                    </button>
                    <button
                      type="button"
                      style={isConfirmDelete ? warnBtn : dangerBtn}
                      disabled={busy}
                      title={isConfirmDelete ? "Click again to confirm delete" : "Delete"}
                      onClick={() => deleteItem(entry.name)}
                    >
                      {isConfirmDelete ? "Sure?" : "✕"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={btnBase}
            disabled={busy || !device}
            onClick={uploadFromHost}
            title="Upload a file from your computer to the current directory"
          >
            ⬆ Upload
          </button>
          <button
            type="button"
            style={btnBase}
            disabled={busy || loading}
            onClick={() => fetchDir(cwd)}
          >
            ↺ Refresh
          </button>
          {error && (
            <span style={{ color: dark ? "#ffb0b0" : "#8a1c1c", fontSize: 12, flex: 1 }}>
              {error}
            </span>
          )}
          <button
            type="button"
            style={{ ...primaryBtn, marginLeft: "auto", opacity: busy ? 0.45 : 1 }}
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      {progress && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            background: dark ? "#0b1216" : "#ffffff",
            border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
            borderRadius: 10,
            padding: "24px 32px",
            minWidth: 320,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            color: dark ? "#dff5fb" : "#0b3b48",
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
              {progress.label}
            </div>
            <div style={{
              height: 8, borderRadius: 4,
              background: dark ? "#1a2a35" : "#e0f0f5",
              overflow: "hidden", marginBottom: 8,
            }}>
              <div style={{
                height: "100%",
                width: progress.total > 0
                  ? `${Math.min(100, Math.round(progress.sent / progress.total * 100))}%`
                  : "0%",
                background: "#0e7490",
                borderRadius: 4,
                transition: "width 0.1s linear",
              }} />
            </div>
            {progress.total > 0 && (() => {
              const elapsed = (Date.now() - transferStartRef.current) / 1000;
              const speed = elapsed > 0.5 && progress.sent > 0 ? progress.sent / elapsed : 0;
              const eta = speed > 0 && progress.total > progress.sent ? (progress.total - progress.sent) / speed : 0;
              return (
                <div style={{ fontSize: 12, color: dark ? "#8ab4c0" : "#5a8a9a", marginBottom: 16 }}>
                  {progress.sent.toLocaleString()} / {progress.total.toLocaleString()} B
                  {" "}({Math.min(100, Math.round(progress.sent / progress.total * 100))}%)
                  {speed > 0 && <> · {fmtSpeed(speed)}</>}
                  {eta > 0 && <> · {fmtEta(eta)}</>}
                </div>
              );
            })()}
            <button
              type="button"
              style={{
                padding: "6px 18px",
                border: dark ? "1px solid #6a1c1c" : "1px solid #f0b4b4",
                background: dark ? "#4a1414" : "#ffe4e4",
                color: dark ? "#ffb0b0" : "#8a1c1c",
                borderRadius: 6, cursor: "pointer", fontWeight: 600,
              }}
              onClick={() => { cancelRef.current = true; }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
