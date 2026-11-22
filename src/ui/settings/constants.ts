import type { AutoReloadMode, AutoReloadSettings } from "../../settings/editorSettings";

export type Section = "general" | "sidebar" | "visual" | "blocks" | "code" | "lsp" | "device" | "run";

export const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "sidebar", label: "Sidebar" },
  { id: "visual", label: "Scene & remote" },
  { id: "blocks", label: "Blocks editor" },
  { id: "code", label: "Code editor" },
  { id: "lsp", label: "Python language server" },
  { id: "device", label: "Device & uploads" },
  { id: "run", label: "Run & reload" },
];

export const RELOAD_MODES: { value: AutoReloadMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "delay", label: "After a delay" },
  { value: "focus", label: "When leaving the editor" },
];

export const RELOAD_KINDS: { kind: keyof AutoReloadSettings; label: string; help: string }[] = [
  { kind: "blocks", label: "Blocks files", help: "Moving blocks around doesn't count, only changes to the generated code." },
  { kind: "scenes", label: "Scene files", help: "Screens built in the scene editor." },
  { kind: "python", label: "Python files", help: "Every other .py file of the project." },
];

export const TAB_LABELS: Record<string, string> = { explorer: "Explorer", projects: "Projects", sdcard: "SD card", device: "Device" };

export const FONT_PRESETS: { label: string; value: string }[] = [
  { label: "Default monospace", value: "" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "Cascadia Code", value: "'Cascadia Code', monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

/** localStorage flag: "true" = don't prompt for firmware updates. */
export const FW_KEY = "b2op.suppressFwUpdates";
