// Project flows: new / rename / delete / download / import / pick.

import { loadProjectAssets, sha256Hex, storeAssets } from "../../project/assets";
import { projectToZip, zipToProject } from "../../project/zip";
import { useApp } from "../../state/store";
import { downloadBytes, pickFile } from "../../utils/download";
import { sanitizeFilename } from "../../utils/sanitize";
import { showAlert, showConfirm, showList, showPrompt, showPromptChoice } from "../dialog";

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

export async function downloadProjectZip(id: string): Promise<void> {
  const p = useApp.getState().getProject(id);
  if (!p) return;
  const assets = await loadProjectAssets(p.files).catch(() => new Map<string, Uint8Array>());
  const missing = p.files.filter((f) => f.asset && !assets.has(f.asset.hash)).map((f) => f.name);
  downloadBytes(projectToZip(p, assets), sanitizeFilename(p.title) + ".zip", "application/zip");
  if (missing.length) await showAlert("Some files were left out", `Their data isn't stored in this browser: ${missing.join(", ")}`);
}

export async function importZipFlow(): Promise<void> {
  const file = await pickFile(".zip,application/zip");
  if (!file) return;
  try {
    const { project, skipped, assets } = await zipToProject(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.zip$/i, "") || "Imported", sha256Hex);
    await storeAssets(assets);
    if (project.files.length === 0) {
      await showAlert("Nothing to import", "The zip has no text files.");
      return;
    }
    useApp.getState().importProject(project, true);
    useApp.getState().openSidebarTab("explorer");
    if (skipped.length) {
      await showAlert("Some files were skipped", <>These aren't text or image files and can't be used here:<ul>{skipped.map((s) => <li key={s}><code>{s}</code></li>)}</ul></>);
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
