import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "./IconButton";
import styles from "./ZoomControls.module.css";

/** Zoom out · percentage (click to reset) · zoom in · fit. Right-aligned in a toolbar. */
export function ZoomControls({ percent, canZoomOut, canZoomIn, onZoomOut, onZoomIn, onReset, onFit, resetTitle = "Reset zoom (Ctrl 0)", fitTitle, hidePercent }: {
  percent: number;
  canZoomOut: boolean;
  canZoomIn: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
  onFit: () => void;
  resetTitle?: string;
  fitTitle: string;
  /** Compact toolbar: no percentage button (Ctrl 0 still resets). */
  hidePercent?: boolean;
}) {
  return (
    <div className={styles.group}>
      <IconButton variant="toolbar" title="Zoom out (Ctrl −)" onClick={onZoomOut} disabled={!canZoomOut}><ZoomOut size={14} /></IconButton>
      {!hidePercent && (
        <button type="button" title={resetTitle} onClick={onReset} className={styles.reset}>
          {Math.round(percent)}%
        </button>
      )}
      <IconButton variant="toolbar" title="Zoom in (Ctrl +)" onClick={onZoomIn} disabled={!canZoomIn}><ZoomIn size={14} /></IconButton>
      <IconButton variant="toolbar" title={fitTitle} onClick={onFit}><Maximize2 size={14} /></IconButton>
    </div>
  );
}
