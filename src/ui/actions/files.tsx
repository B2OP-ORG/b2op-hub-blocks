// File flows inside the active project.

import { type FileMode, baseName } from "../../project/format";
import { normalizeRelPath, relJoin } from "../../project/paths";
import { type NewFileInput, useApp } from "../../state/store";
import { downloadBytes, downloadText, pickFiles } from "../../utils/download";
import { getAssetBytes } from "../../project/assets";
import { showAlert, showConfirm, showPrompt } from "../dialog";
import { addFilesWithPrompt, fileInputFromBytes, validateRelName } from "./common";

// ── File flows (active project) ──────────────────────────────────────────────

export async function newFileFlow(dir = "", kind: FileMode = "python"): Promise<void> {
  const name = await showPrompt(kind === "blocks" ? "New blocks file" : "New Python file", relJoin(dir, kind === "blocks" ? "blocks.py" : "untitled.py"), {
    selectStem: true,
    validate: validateRelName,
  });
  if (name === null) return;
  const path = normalizeRelPath(name)!;
  const finalPath = /\.[^/]+$/.test(baseName(path)) ? path : path + ".py";
  useApp.getState().newFile("", finalPath, kind);
}

export async function newFolderFlow(dir = ""): Promise<void> {
  const name = await showPrompt("New folder", relJoin(dir, "folder"), { validate: validateRelName });
  if (name === null) return;
  const err = useApp.getState().newFolder(name);
  if (err) await showAlert("Can't create folder", err);
}

export async function deleteFileFlow(id: string): Promise<void> {
  const f = useApp.getState().mfp.files.find((x) => x.id === id);
  if (!f) return;
  if (await showConfirm(`Delete "${f.name}"?`, "The file is removed from the project. This can't be undone.", { confirmLabel: "Delete", danger: true })) {
    useApp.getState().deleteFile(id);
  }
}

export async function deleteFolderFlow(path: string): Promise<void> {
  const count = useApp.getState().mfp.files.filter((f) => f.name.startsWith(path + "/")).length;
  if (await showConfirm(`Delete folder "${path}"?`, count ? `It contains ${count} file${count === 1 ? "" : "s"}, which will be deleted too. This can't be undone.` : "This can't be undone.", { confirmLabel: "Delete", danger: true })) {
    useApp.getState().deleteFolder(path);
  }
}

export async function downloadProjectFile(id: string): Promise<void> {
  const f = useApp.getState().mfp.files.find((x) => x.id === id);
  if (!f) return;
  if (f.asset) {
    const bytes = await getAssetBytes(f.asset.hash);
    if (bytes) downloadBytes(bytes, baseName(f.name), f.asset.type);
    else await showAlert("Can't download", "This file's data isn't stored in this browser.");
    return;
  }
  downloadText(f.content, baseName(f.name), "text/x-python");
}

export async function importFilesFromComputer(dir = ""): Promise<void> {
  const files = await pickFiles("");
  if (files.length === 0) return;
  const inputs: NewFileInput[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const input = await fileInputFromBytes(relJoin(dir, file.name), new Uint8Array(await file.arrayBuffer()));
    if (!input) { skipped.push(file.name); continue; }
    inputs.push(input);
  }
  const s = useApp.getState();
  const ids = inputs.length ? await addFilesWithPrompt(s.mfp.id, inputs) : [];
  if (ids && ids.length === 1) useApp.getState().openFile(ids[0]);
  if (skipped.length) await showAlert("Some files were skipped", `Not text files: ${skipped.join(", ")}`);
}
