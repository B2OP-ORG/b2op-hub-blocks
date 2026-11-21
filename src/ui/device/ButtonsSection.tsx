import { useApp } from "../../state/store";
import { PanelSection } from "./PanelSection";

/** The hub's five buttons as a d-pad, lit while pressed. */
export function ButtonsSection() {
  const buttonState = useApp((s) => s.buttonState);
  const btn = (label: string) => <Btn label={label} pressed={!!buttonState[label]} />;
  return (
    <PanelSection title="Buttons" titleGap={8}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, width: 120 }}>
          <div />{btn("up")}<div />
          {btn("left")}{btn("center")}{btn("right")}
          <div />{btn("down")}<div />
        </div>
      </div>
    </PanelSection>
  );
}

function Btn({ label, pressed }: { label: string; pressed: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      cursor: "default", userSelect: "none",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: pressed ? "#4cc3ff" : "#1a3540",
        boxShadow: pressed ? "0 0 8px #4cc3ff80" : "none",
        border: `1px solid ${pressed ? "#4cc3ff" : "#2a5060"}`,
        transition: "background 0.1s, box-shadow 0.1s",
      }} />
      <span style={{ fontSize: 9, color: pressed ? "#dff5fb" : "#3a5a64", letterSpacing: 0.5 }}>
        {label}
      </span>
    </div>
  );
}
