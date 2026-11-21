import { ArrowUpCircle } from "lucide-react";
import { useApp } from "../../state/store";

/** Board name / version (connected) and the "Update" pill when newer firmware exists. */
export function BoardInfo({ dark, showText, onOpenFwUpdate }: { dark: boolean; showText: boolean; onOpenFwUpdate?: () => void }) {
  const connection = useApp((s) => s.connection);
  const boardName = useApp((s) => s.boardName);
  const boardVersion = useApp((s) => s.boardVersion);
  const fwVersion = useApp((s) => s.fwVersion);
  return (
    <>
      {showText && connection === "connected" && boardName && (
        <span style={{ fontSize: 11, opacity: 0.75, color: dark ? "#a0cce0" : "#e0f4ff" }}>
          {boardName}{boardVersion ? ` ${boardVersion}` : ""}{fwVersion ? ` (${fwVersion})` : ""}
        </span>
      )}
      {onOpenFwUpdate && (
        <button
          type="button"
          onClick={onOpenFwUpdate}
          title="Firmware update available"
          style={{
            padding: showText ? "3px 9px" : "3px 6px",
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 12,
            cursor: "pointer",
            background: "#92400e",
            color: "#fef3c7",
            border: "1px solid #b45309",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ArrowUpCircle size={12} />{showText && " Update"}
        </button>
      )}
    </>
  );
}
