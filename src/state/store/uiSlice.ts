import type { StateCreator } from "zustand";
import { SIDEBAR_TAB_IDS, type SidebarTabId } from "../../settings/editorSettings";
import { loadSidebarLayout, saveSidebarLayout } from "../../settings/storage";
import { EXAMPLE_PREVIEW_ID, type AppState, type ExtraTab } from "./types";

/** Sidebar layout and extra (non-file) editor tabs. */
export interface UiSlice {
  sidebarTab: SidebarTabId;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  setSidebarTab: (t: SidebarTabId) => void;
  /** Activate a tab and make sure the sidebar is expanded. */
  openSidebarTab: (t: SidebarTabId) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;

  // ── Extra (non-file) editor tabs: doc pages, example previews ───────────
  /** Session-only; not stored in the project. */
  extraTabs: ExtraTab[];
  /** When set, the workspace shows this extra tab instead of the active file. */
  activeExtraTab: string | null;
  /** Open (or focus) an extra tab. Example previews share one slot. */
  openExtraTab: (t: ExtraTab) => void;
  closeExtraTab: (id: string) => void;
  updateExtraTab: (id: string, patch: Partial<Omit<ExtraTab, "id">>) => void;
  closeOtherExtraTabs: (id: string) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => {
  const sidebarLayout = loadSidebarLayout();
  const saveLayout = () => {
    const s = get();
    saveSidebarLayout({ activeTab: s.sidebarTab, collapsed: s.sidebarCollapsed, width: s.sidebarWidth });
  };

  return {
    sidebarTab: SIDEBAR_TAB_IDS.includes(sidebarLayout.activeTab as SidebarTabId)
      ? (sidebarLayout.activeTab as SidebarTabId) : "explorer",
    sidebarCollapsed: sidebarLayout.collapsed,
    sidebarWidth: sidebarLayout.width,
    setSidebarTab: (sidebarTab) => { set({ sidebarTab }); saveLayout(); },
    openSidebarTab: (sidebarTab) => { set({ sidebarTab, sidebarCollapsed: false }); saveLayout(); },
    setSidebarCollapsed: (sidebarCollapsed) => { set({ sidebarCollapsed }); saveLayout(); },
    setSidebarWidth: (sidebarWidth) => { set({ sidebarWidth }); saveLayout(); },

    extraTabs: [],
    activeExtraTab: null,
    openExtraTab: (t) => set((s) => {
      const tab = t.kind === "example" ? { ...t, id: EXAMPLE_PREVIEW_ID } : t;
      const idx = s.extraTabs.findIndex((x) => x.id === tab.id);
      const extraTabs = idx === -1 ? [...s.extraTabs, tab] : s.extraTabs.map((x, i) => (i === idx ? tab : x));
      return { extraTabs, activeExtraTab: tab.id };
    }),
    closeExtraTab: (id) => set((s) => {
      const idx = s.extraTabs.findIndex((x) => x.id === id);
      if (idx === -1) return {};
      const extraTabs = s.extraTabs.filter((x) => x.id !== id);
      if (s.activeExtraTab !== id) return { extraTabs };
      // Fall back to a neighbouring extra tab, else to the active file.
      const next = extraTabs[Math.min(idx, extraTabs.length - 1)];
      return { extraTabs, activeExtraTab: s.activeFileId ? null : (next?.id ?? null) };
    }),
    updateExtraTab: (id, patch) => set((s) => ({ extraTabs: s.extraTabs.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    closeOtherExtraTabs: (id) => set((s) => ({ extraTabs: s.extraTabs.filter((x) => x.id === id), activeExtraTab: s.extraTabs.some((x) => x.id === id) ? id : null })),
  };
};
