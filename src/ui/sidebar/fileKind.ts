import {
  Blocks, File, FileArchive, FileBox, FileBraces, FileCode, FileCog, FileDigit, FileImage, FileLock, FileMusic, FilePlay,
  FileSpreadsheet, FileTerminal, FileText, FileType, Folder, Gamepad2, Monitor, type LucideIcon,
} from "lucide-react";
import { fileMode, type ProjectFile } from "../../project/format";
import { isRemoteFile } from "../../remote/layout";
import { isSceneFile } from "../../scene/project";

/** How a file shows up in lists and tabs. `color` "accent" / "dim" follow the palette. */
export interface FileKind {
  icon: LucideIcon;
  color: string;
  /** Short human name of the type, e.g. "Python", "Image". */
  label: string;
}

const PYTHON: FileKind = { icon: FileCode, color: "accent", label: "Python" };
const BLOCKS: FileKind = { icon: Blocks, color: "#d97706", label: "Blocks" };
const SCENE: FileKind = { icon: Monitor, color: "#7c3aed", label: "Scene" };
const REMOTE: FileKind = { icon: Gamepad2, color: "#db2777", label: "Remote layout" };
const IMAGE: FileKind = { icon: FileImage, color: "#0d9488", label: "Image" };
const UNKNOWN: FileKind = { icon: File, color: "dim", label: "File" };
export const FOLDER_KIND: FileKind = { icon: Folder, color: "#d97706", label: "Folder" };

const kinds = (exts: string[], kind: FileKind) => exts.map((e) => [e, kind] as const);

/** File kinds by lower-case extension. The hub's SD card can hold anything, so this goes past what the editor opens. */
const BY_EXT = new Map<string, FileKind>([
  ...kinds(["py", "pyi"], PYTHON),
  ...kinds(["mpy"], { icon: FileBox, color: "#0891b2", label: "Compiled Python" }),
  ...kinds(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tga", "ppm", "pgm", "pbm"], IMAGE),
  ...kinds(["json", "jsonc", "json5"], { icon: FileBraces, color: "#ca8a04", label: "JSON" }),
  ...kinds(["txt", "md", "markdown", "rst", "log", "rtf"], { icon: FileText, color: "dim", label: "Text" }),
  ...kinds(["csv", "tsv"], { icon: FileSpreadsheet, color: "#16a34a", label: "Spreadsheet" }),
  ...kinds(["ini", "cfg", "conf", "config", "toml", "yaml", "yml", "env", "properties", "xml"], { icon: FileCog, color: "#64748b", label: "Config" }),
  ...kinds(["wav", "mp3", "ogg", "flac", "aac", "m4a", "pcm", "mid", "midi"], { icon: FileMusic, color: "#e11d48", label: "Audio" }),
  ...kinds(["mp4", "avi", "mov", "mkv", "webm", "mjpeg", "mjpg"], { icon: FilePlay, color: "#9333ea", label: "Video" }),
  ...kinds(["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar"], { icon: FileArchive, color: "#a16207", label: "Archive" }),
  ...kinds(["bin", "hex", "elf", "img", "uf2", "dat", "dfu"], { icon: FileDigit, color: "#475569", label: "Binary" }),
  ...kinds(["ttf", "otf", "woff", "woff2", "bdf", "pcf", "fnt"], { icon: FileType, color: "#2563eb", label: "Font" }),
  ...kinds(["sh", "bash", "bat", "cmd", "ps1"], { icon: FileTerminal, color: "#15803d", label: "Script" }),
  ...kinds(["c", "h", "cpp", "hpp", "cc", "js", "mjs", "ts", "html", "htm", "css"], { icon: FileCode, color: "#64748b", label: "Source" }),
  ...kinds(["pem", "crt", "cer", "der", "key", "pub"], { icon: FileLock, color: "#b45309", label: "Certificate / key" }),
]);

/** Kind of a file from its name alone (device listings, where the content isn't loaded). */
export function fileKindByName(name: string): FileKind {
  if (isRemoteFile(name)) return REMOTE;
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return UNKNOWN; // no extension, or a dotfile like ".hidden"
  return BY_EXT.get(base.slice(dot + 1).toLowerCase()) ?? UNKNOWN;
}

/** Kind of a project file: the content tells scenes and blocks apart from plain Python. */
export function fileKindOf(file: ProjectFile): FileKind {
  if (file.asset) return IMAGE;
  if (isSceneFile(file)) return SCENE;
  if (/\.pyi?$/i.test(file.name)) return fileMode(file) === "blocks" ? BLOCKS : PYTHON;
  return fileKindByName(file.name);
}
