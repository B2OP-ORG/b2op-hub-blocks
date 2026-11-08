// User-facing flows shared by the sidebar tabs, tab bar and header.

import { useApp, type NewFileInput } from "../state/store";
import { baseName, getBlocksWorkspace, hashContent, newMultiFileProject, type FileMode } from "../project/format";
import { normalizeRelPath, relJoin, devJoin, devBaseName } from "../project/paths";
import { projectToZip, zipToProject, downloadBytes } from "../project/zip";
import { downloadText, pickFile, pickFiles } from "../project/download";
import { CancelledError, deviceRelPath, projectRoot } from "../project/deviceSync";
import { sanitizeFilename } from "../utils/sanitize";
import { fetchExample, pathInExample, type ExampleEntry } from "../examples";
import { showAlert, showChoice, showConfirm, showList, showPrompt, showPromptChoice } from "./Dialog";

// ── Small helpers ──────────────────────────────────────────────────────────────

export function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function modeFor(content: string): FileMode | undefined {
  return getBlocksWorkspace({ content }) !== null ? "blocks" : undefined;
}

/** Validator for project-relative names typed by the user. */
export function validateRelName(v: string): string | null {
  if (!v.trim()) return "Name cannot be empty.";
  if (!normalizeRelPath(v)) return "Invalid name.";
  return null;
}

/**
 * Ask how to handle files that already exist in the target project.
 * Returns true = overwrite, false = keep both (rename), null = cancel.
 */
async function resolveCollisions(projectId: string, names: string[]): Promise<boolean | null> {
  const p = useApp.getState().getProject(projectId);
  if (!p) return null;
  const existing = names.filter((n) => p.files.some((f) => f.name.toLowerCase() === n.toLowerCase()));
  if (existing.length === 0) return false;
  const choice = await showChoice(
    existing.length === 1 ? "File already exists" : "Files already exist",
    <>
      <p style={{ marginTop: 0 }}>Project "{p.title}" already contains:</p>
      <ul style={{ paddingLeft: 18, margin: 0, maxHeight: 160, overflowY: "auto" }}>
        {existing.map((n) => <li key={n}><code>{n}</code></li>)}
      </ul>
    </>,
    [
      { value: "cancel", label: "Cancel" },
      { value: "rename", label: "Keep both" },
      { value: "overwrite", label: "Replace", kind: "danger" },
    ],
    "cancel",
  );
  return choice === "cancel" ? null : choice === "overwrite";
}

/** Add files to a project after resolving name collisions. Returns ids or null if cancelled. */
export async function addFilesWithPrompt(projectId: string, files: NewFileInput[]): Promise<string[] | null> {
  const overwrite = await resolveCollisions(projectId, files.map((f) => normalizeRelPath(f.name) ?? f.name));
  if (overwrite === null) return null;
  return useApp.getState().addFilesToProject(projectId, files, overwrite);
}

// ── Project flows ─────────────────────────────────────────────────────────────

export async function newProjectFlow(): Promise<void> {
  const { value, text } = await showPromptChoice(
    "New project",
    "My project",
    [
      { value: "cancel", label: "Cancel" },
      { value: "python", label: "Python" },
      { value: "blocks", label: "Blocks", kind: "primary" },
    ],
    "cancel",
    {
      body: <>Name the project and choose how to write its <code>main.py</code>.</>,
      validate: (v) => (v.trim() ? null : "Name cannot be empty."),
    },
  );
  if (value === "cancel") return;
  useApp.getState().createProject(text, value);
  useApp.getState().openSidebarTab("explorer");
}

export async function renameProjectFlow(id: string): Promise<void> {
  const p = useApp.getState().projects.find((x) => x.id === id);
  if (!p) return;
  const title = await showPrompt("Rename project", p.title, {
    body: <>Uploads go to <code>/sd/&lt;name&gt;/</code>, so renaming means the next upload goes to a new folder.</>,
    validate: (v) => (v.trim() ? null : "Name cannot be empty."),
  });
  if (title === null) return;
  const err = useApp.getState().renameProject(id, title);
  if (err) await showAlert("Can't rename project", err);
}

export async function deleteProjectFlow(id: string): Promise<void> {
  const p = useApp.getState().projects.find((x) => x.id === id);
  if (!p) return;
  const ok = await showConfirm(
    `Delete "${p.title}"?`,
    "The project and all its files are removed from this browser. Files already on the hub's SD card are not touched. This can't be undone.",
    { confirmLabel: "Delete", danger: true },
  );
  if (ok) useApp.getState().deleteProject(id);
}

export function downloadProjectZip(id: string): void {
  const p = useApp.getState().getProject(id);
  if (!p) return;
  downloadBytes(projectToZip(p), sanitizeFilename(p.title) + ".zip", "application/zip");
}

export async function importZipFlow(): Promise<void> {
  const file = await pickFile(".zip,application/zip");
  if (!file) return;
  try {
    const { project, skipped } = zipToProject(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.zip$/i, "") || "Imported");
    if (project.files.length === 0) {
      await showAlert("Nothing to import", "The zip has no text files.");
      return;
    }
    useApp.getState().importProject(project, true);
    useApp.getState().openSidebarTab("explorer");
    if (skipped.length) {
      await showAlert("Some files were skipped", <>These aren't text files and can't be edited here:<ul>{skipped.map((s) => <li key={s}><code>{s}</code></li>)}</ul></>);
    }
  } catch (e) {
    await showAlert("Import failed", `Couldn't read the zip: ${(e as Error).message}`);
  }
}

/** Ask for a target project (current one first). */
export async function pickProject(title: string): Promise<string | null> {
  const s = useApp.getState();
  const items = [...s.projects]
    .sort((a, b) => (a.id === s.mfp.id ? -1 : b.id === s.mfp.id ? 1 : a.title.localeCompare(b.title)))
    .map((m) => ({ value: m.id, label: m.title, detail: `${m.fileCount} file${m.fileCount === 1 ? "" : "s"}${m.id === s.mfp.id ? " · open" : ""}`, current: m.id === s.mfp.id }));
  return showList(title, items);
}

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

export function downloadProjectFile(id: string): void {
  const f = useApp.getState().mfp.files.find((x) => x.id === id);
  if (!f) return;
  downloadText(f.content, baseName(f.name), "text/x-python");
}

export async function importFilesFromComputer(dir = ""): Promise<void> {
  const files = await pickFiles("");
  if (files.length === 0) return;
  const inputs: NewFileInput[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const text = decodeText(new Uint8Array(await file.arrayBuffer()));
    if (text === null) { skipped.push(file.name); continue; }
    inputs.push({ name: relJoin(dir, file.name), content: text, mode: modeFor(text) });
  }
  const s = useApp.getState();
  const ids = inputs.length ? await addFilesWithPrompt(s.mfp.id, inputs) : [];
  if (ids && ids.length === 1) useApp.getState().openFile(ids[0]);
  if (skipped.length) await showAlert("Some files were skipped", `Not text files: ${skipped.join(", ")}`);
}

// ── Device → project ─────────────────────────────────────────────────────────

/** Read a device file with progress + cancel through the transfer overlay. */
export async function readDeviceFile(path: string): Promise<Uint8Array> {
  const { device, setTransfer } = useApp.getState();
  if (!device) throw new Error("No hub connected.");
  const label = `Reading ${devBaseName(path)}…`;
  const startedAt = Date.now();
  setTransfer({ label, sent: 0, total: 0, startedAt });
  try {
    return await device.readFileRaw(path, {
      onProgress: (sent, total) => {
        if (useApp.getState().transferCancel) throw new CancelledError();
        setTransfer({ label, sent, total, startedAt });
      },
    });
  } finally {
    setTransfer(null);
  }
}

async function reportDeviceError(action: string, e: unknown): Promise<void> {
  const { appendConsole } = useApp.getState();
  if (e instanceof CancelledError || (e as Error)?.message === "Cancelled") {
    // The protocol layer already sent ABORT for the cancelled stream.
    appendConsole("info", `[${action} cancelled]\n`);
    return;
  }
  appendConsole("err", `[${action} failed: ${(e as Error).message}]\n`);
  await showAlert(`Couldn't ${action}`, (e as Error).message);
}

/** Load one SD file into a project (top level). */
export async function loadDeviceFileIntoProject(path: string, projectId: string): Promise<void> {
  try {
    const bytes = await readDeviceFile(path);
    const text = decodeText(bytes);
    if (text === null) {
      await showAlert("Not a text file", `"${devBaseName(path)}" isn't UTF-8 text and can't be edited here.`);
      return;
    }
    const ids = await addFilesWithPrompt(projectId, [{ name: devBaseName(path), content: text, mode: modeFor(text) }]);
    if (!ids) return;
    const s = useApp.getState();
    if (projectId === s.mfp.id && ids[0]) s.openFile(ids[0]);
    s.appendConsole("info", `[load ← ${path} (${bytes.length}B)]\n`);
  } catch (e) {
    await reportDeviceError("load file", e);
  }
}

export async function loadDeviceFileIntoPickedProject(path: string): Promise<void> {
  const id = await pickProject(`Load "${devBaseName(path)}" into project`);
  if (id) await loadDeviceFileIntoProject(path, id);
}

/** Recursively read an SD directory into a new project. */
export async function loadDeviceDirAsProject(dirPath: string): Promise<void> {
  const st = useApp.getState();
  const device = st.device;
  if (!device) return;
  const files: NewFileInput[] = [];
  const folders: string[] = [];
  const skipped: string[] = [];
  try {
    const walk = async (abs: string, rel: string): Promise<void> => {
      const entries = await device.ls(abs);
      for (const e of entries) {
        if (useApp.getState().transferCancel) throw new CancelledError();
        const childAbs = devJoin(abs, e.name);
        const childRel = relJoin(rel, e.name);
        if (e.isDir) {
          folders.push(childRel);
          await walk(childAbs, childRel);
        } else {
          const bytes = await readDeviceFile(childAbs);
          const text = decodeText(bytes);
          if (text === null) skipped.push(childRel);
          else files.push({ name: childRel, content: text, mode: modeFor(text) });
        }
      }
    };
    await walk(dirPath, "");
  } catch (e) {
    await reportDeviceError("load folder", e);
    return;
  }

  const s = useApp.getState();
  const title = s.uniqueProjectTitle(devBaseName(dirPath) || "Imported");
  const base = newMultiFileProject(title);
  const withIds = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, content: f.content, mode: f.mode }));
  const first = withIds.find((f) => f.name === "main.py") ?? withIds[0];
  const id = s.importProject({
    ...base,
    files: withIds,
    folders,
    openFileIds: first ? [first.id] : [],
    activeFileId: first?.id ?? "",
  }, true);

  // If the project maps back onto the same SD folder, its files are already in sync.
  const p = useApp.getState().getProject(id);
  if (p && projectRoot(p.title) === dirPath.replace(/\/+$/, "") && s.deviceName) {
    const hashes: Record<string, string> = {};
    for (const f of p.files) if (deviceRelPath(f.name) === f.name) hashes[f.name] = hashContent(f.content);
    useApp.getState().recordUpload(id, s.deviceName, hashes, true);
  }
  useApp.getState().persist();
  useApp.getState().openSidebarTab("explorer");
  useApp.getState().appendConsole("info", `[loaded ${dirPath} as project "${title}": ${files.length} file${files.length === 1 ? "" : "s"}]\n`);
  if (skipped.length) await showAlert("Some files were skipped", <>Not text files:<ul>{skipped.map((x) => <li key={x}><code>{x}</code></li>)}</ul></>);
}

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
  const withIds = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, content: f.content, mode: f.mode ?? "python" as FileMode }));
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
    const p = { ...newMultiFileProject(entry.title), files: files.map((f) => ({ id: crypto.randomUUID(), name: f.name, content: f.content, mode: f.mode ?? "python" as FileMode })) };
    downloadBytes(projectToZip(p), sanitizeFilename(entry.title) + ".zip", "application/zip");
    return;
  }
  const f = files.find((x) => !file || x.name === pathInExample(entry, file)) ?? files[0];
  downloadText(f.content, baseName(f.name));
}
