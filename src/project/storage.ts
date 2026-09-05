import type { AnyProject } from "./format";
import { parseProject } from "./format";

const KEY_AUTOSAVE = "b2op.autosave";
const KEY_LAST_DEVICE = "b2op.lastDeviceName";

export function loadAutosave(): AnyProject | null {
  try {
    const raw = localStorage.getItem(KEY_AUTOSAVE);
    if (!raw) return null;
    const result = parseProject(JSON.parse(raw));
    if (!result) return null;
    // Stale autosaves are silently discarded — user can open old files manually.
    if (result.stale) return null;
    return result.project;
  } catch {
    return null;
  }
}

export function saveAutosave(project: AnyProject): void {
  try {
    localStorage.setItem(KEY_AUTOSAVE, JSON.stringify(project));
  } catch {
    // storage quota — silent
  }
}

export function loadLastDeviceName(): string | null {
  return localStorage.getItem(KEY_LAST_DEVICE);
}

export function saveLastDeviceName(name: string): void {
  localStorage.setItem(KEY_LAST_DEVICE, name);
}
