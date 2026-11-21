import type { SidebarTabId } from "../../settings/editorSettings";
import { usePalette } from "../theme";
import { TAB_INFO } from "./tabInfo";

const ACTIVITY_W = 42;

/** Icon strip next to the sidebar: one button per visible tab. */
export function ActivityBar({ side, tabs, current, open, onIconClick, onMenu }: {
  side: "left" | "right";
  tabs: SidebarTabId[];
  current: SidebarTabId | undefined;
  /** The panel is expanded (highlights the current tab). */
  open: boolean;
  onIconClick: (t: SidebarTabId) => void;
  /** Right-click on the strip (no tab) or on a tab icon. */
  onMenu: (e: React.MouseEvent, t?: SidebarTabId) => void;
}) {
  const p = usePalette();
  return (
    <div
      style={{
        width: ACTIVITY_W,
        flexShrink: 0,
        background: p.dark ? "#070c0f" : "#c5e2eb",
        borderLeft: side === "right" ? `1px solid ${p.border}` : undefined,
        borderRight: side === "left" ? `1px solid ${p.border}` : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 4,
        gap: 2,
      }}
      onContextMenu={(e) => onMenu(e)}
    >
      {tabs.map((t) => {
        const active = open && t === current;
        return (
          <button
            key={t}
            type="button"
            title={TAB_INFO[t].label}
            aria-label={TAB_INFO[t].label}
            aria-pressed={active}
            onClick={() => onIconClick(t)}
            onContextMenu={(e) => onMenu(e, t)}
            style={{
              width: ACTIVITY_W,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              borderLeft: side === "left" ? `2px solid ${active ? p.accent : "transparent"}` : "2px solid transparent",
              borderRight: side === "right" ? `2px solid ${active ? p.accent : "transparent"}` : "2px solid transparent",
              color: active ? p.text : p.dimText,
              opacity: active ? 1 : 0.8,
              cursor: "pointer",
            }}
          >
            {TAB_INFO[t].icon}
          </button>
        );
      })}
    </div>
  );
}
