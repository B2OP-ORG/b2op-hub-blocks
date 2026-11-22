// Example flows: open as project, add to a project, download.

import { type ExampleEntry, fetchExample, pathInExample } from "../../examples";
import { type FileMode, baseName, newMultiFileProject } from "../../project/format";
import { projectToZip } from "../../project/zip";
import { type NewFileInput, useApp } from "../../state/store";
import { downloadBytes, downloadText } from "../../utils/download";
import { sanitizeFilename } from "../../utils/sanitize";
import { showAlert } from "../dialog";
import { addFilesWithPrompt, modeFor } from "./common";
import { pickProject } from "./project";
import { newId } from "../../utils/id";

// ── Example flows ─────────────────────────────────────────────────────────────

async function loadExampleFiles(entry: ExampleEntry, asMain: boolean): Promise<NewFileInput[] | null> {
  try {
    const texts = await Promise.all(entry.files.map(fetchExample));
    return entry.files.map((f, i) => ({
      // A single-file example becomes main.py when opened as its own project.
      name: !entry.folder && asMain ? "main.py" : pathInExample(entry, f),
      content: texts[i],
      mode: modeFor(texts[i]),
    }));
  } catch (e) {
    await showAlert("Couldn't load example", (e as Error).message);
    return null;
  }
}

/** Create a new project from an example. Single-file examples become main.py. */
export async function openExampleAsProject(entry: ExampleEntry): Promise<void> {
  const files = await loadExampleFiles(entry, true);
  if (!files) return;
  const s = useApp.getState();
  const base = newMultiFileProject(s.uniqueProjectTitle(entry.title));
  const withIds = files.map((f) => ({ id: newId(), name: f.name, content: f.content, mode: f.mode ?? "python" as FileMode }));
  const first = withIds.find((f) => f.name === "main.py") ?? withIds[0];
  const folders = [...new Set(withIds.flatMap((f) => {
    const parts = f.name.split("/").slice(0, -1);
    return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  }))].sort();
  s.importProject({ ...base, files: withIds, folders, openFileIds: first ? [first.id] : [], activeFileId: first?.id ?? "" }, true);
  useApp.getState().persist();
}

/** Copy an example's file(s) into a project (asks on name clashes) and open them if active. */
export async function addExampleToProject(entry: ExampleEntry, projectId?: string): Promise<void> {
  const target = projectId ?? useApp.getState().mfp.id;
  const files = await loadExampleFiles(entry, false);
  if (!files) return;
  const ids = await addFilesWithPrompt(target, files);
  if (!ids?.length) return;
  if (target === useApp.getState().mfp.id) {
    useApp.getState().openFile(ids[0]);
    useApp.getState().persist();
  }
}

export async function addExampleToOtherProject(entry: ExampleEntry): Promise<void> {
  const id = await pickProject(`Add "${entry.title}" to…`);
  if (id) await addExampleToProject(entry, id);
}

export async function downloadExample(entry: ExampleEntry, file?: string): Promise<void> {
  const files = await loadExampleFiles(entry, false);
  if (!files) return;
  if (entry.folder && !file) {
    const p = { ...newMultiFileProject(entry.title), files: files.map((f) => ({ id: newId(), name: f.name, content: f.content, mode: f.mode ?? "python" as FileMode })) };
    downloadBytes(projectToZip(p), sanitizeFilename(entry.title) + ".zip", "application/zip");
    return;
  }
  const f = files.find((x) => !file || x.name === pathInExample(entry, file)) ?? files[0];
  downloadText(f.content, baseName(f.name));
}
