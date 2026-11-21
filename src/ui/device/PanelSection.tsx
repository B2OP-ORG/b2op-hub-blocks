import { usePalette } from "../theme";
import { deviceColors } from "./deviceInfo";

/** Titled block of the Device panel, separated from the next by a line. */
export function PanelSection({ title, last, titleGap = 6, children }: { title: string; last?: boolean; titleGap?: number; children: React.ReactNode }) {
  const c = deviceColors(usePalette());
  return (
    <div style={{ padding: "10px 12px", borderBottom: last ? undefined : `1px solid ${c.sep}` }}>
      <div style={{ color: c.heading, marginBottom: titleGap, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}
