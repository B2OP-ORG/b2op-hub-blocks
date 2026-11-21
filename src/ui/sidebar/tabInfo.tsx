import { BookOpen, Cpu, FolderKanban, Files, HardDrive, Lightbulb } from "lucide-react";
import type { SidebarTabId } from "../../settings/editorSettings";

/** Label and activity-bar icon of each sidebar tab. */
export const TAB_INFO: Record<SidebarTabId, { label: string; icon: React.ReactNode }> = {
  explorer: { label: "Explorer", icon: <Files size={20} /> },
  projects: { label: "Projects", icon: <FolderKanban size={20} /> },
  sdcard: { label: "SD card", icon: <HardDrive size={20} /> },
  device: { label: "Device", icon: <Cpu size={20} /> },
  docs: { label: "Docs", icon: <BookOpen size={20} /> },
  examples: { label: "Examples", icon: <Lightbulb size={20} /> },
};
