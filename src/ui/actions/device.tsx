// Device → project: load files and folders from the hub's SD card.

import { hashContent, newMultiFileProject } from "../../project/format";
import { devBaseName, devJoin, relJoin } from "../../project/paths";
import { CancelledError, deviceRelPath, projectRoot } from "../../run/deviceSync";
import { type NewFileInput, useApp } from "../../state/store";
import { showAlert } from "../dialog";
import { addFilesWithPrompt, decodeText, modeFor } from "./common";
import { pickProject } from "./project";

// ── Device → project ─────────────────────────────────────────────────────────

/** Read a device file with progress + cancel through the transfer overlay. */
export async function readDeviceFile(path: string): Promise<Uint8Array> {
  const { device, setTransfer, transferSignal } = useApp.getState();
  if (!device) throw new Error("No hub connected.");
  const label = `Reading ${devBaseName(path)}…`;
  const startedAt = Date.now();
  setTransfer({ label, sent: 0, total: 0, startedAt });
  try {
    // Cancel → ABORT; rejects with CancelledError once the hub confirms.
    return await device.readFileRaw(path, {
      signal: transferSignal(),
      onProgress: (sent, total) => {
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
