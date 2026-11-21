// Helpers shared by the action flows: text decoding, name checks, adding files with a collision prompt.

import { type FileMode, getBlocksWorkspace } from "../../project/format";
import { normalizeRelPath } from "../../project/paths";
import { type NewFileInput, useApp } from "../../state/store";
import { showChoice } from "../dialog";

// ── Small helpers ──────────────────────────────────────────────────────────────

export function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function modeFor(content: string): FileMode | undefined {
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
