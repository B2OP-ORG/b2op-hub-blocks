// Header colours: the top bar is accent-coloured in light mode, so its buttons
// use translucent white there instead of the palette.

export type StatusKind = "ok" | "err" | "idle" | "run";

export function headerStyles(dark: boolean) {
  const btn: React.CSSProperties = {
    padding: "4px 10px",
    border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.55)",
    background: dark ? "#111a20" : "rgba(255,255,255,0.20)",
    color: dark ? "#dff5fb" : "#ffffff",
    cursor: "pointer",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };
  const variant = (bg: [string, string], border: [string, string], color?: [string, string]): React.CSSProperties => ({
    ...btn,
    background: dark ? bg[0] : bg[1],
    border: `1px solid ${dark ? border[0] : border[1]}`,
    ...(color ? { color: dark ? color[0] : color[1] } : {}),
  });
  return {
    headerBg: dark ? "#0b1216" : "#0e7490",
    headerBorder: dark ? "#164e63" : "#155e75",
    text: dark ? "#dff5fb" : "#ffffff",
    btn,
    primary: variant(["#0c3a4a", "rgba(255,255,255,0.28)"], ["#155e75", "rgba(255,255,255,0.75)"]),
    success: variant(["#0f3e21", "rgba(20,140,70,0.55)"], ["#1a5a30", "rgba(80,230,130,0.85)"], ["#a9dcbc", "#ffffff"]),
    danger: variant(["#4a1414", "rgba(190,30,30,0.55)"], ["#6a1c1c", "rgba(255,110,110,0.85)"], ["#ffb0b0", "#ffffff"]),
    warn: variant(["#3c1a04", "rgba(200,100,0,0.55)"], ["#78350f", "rgba(251,191,36,0.85)"], ["#fde68a", "#ffffff"]),
    indigo: variant(["#1e1b4b", "rgba(90,100,255,0.50)"], ["#3730a3", "rgba(150,160,255,0.80)"], ["#a5b4fc", "#ffffff"]),
    badgeBg: (k: StatusKind) =>
      dark
        ? k === "ok" ? "#0f3e21" : k === "err" ? "#4a1414" : k === "run" ? "#3a2a05" : "#111a20"
        : k === "ok" ? "rgba(20,140,70,0.55)" : k === "err" ? "rgba(190,30,30,0.55)" : k === "run" ? "rgba(180,130,0,0.55)" : "rgba(255,255,255,0.22)",
    badgeFg: (k: StatusKind) =>
      dark
        ? k === "ok" ? "#a9dcbc" : k === "err" ? "#ffb0b0" : k === "run" ? "#ffd166" : "#dff5fb"
        : "#ffffff",
  };
}

export type HeaderStyles = ReturnType<typeof headerStyles>;

/** Disabled look for a header button. */
export function dis(base: React.CSSProperties, disabled: boolean): React.CSSProperties {
  return disabled ? { ...base, opacity: 0.45, cursor: "not-allowed" } : base;
}

/**
 * Compaction (see useCompactLevel): a label is shown until `compact` reaches
 * `hideAt` (1 = secondary actions, 2 = primary actions + board info).
 */
export function labelShown(compact: number, hideAt: number): boolean {
  return compact < hideAt;
}

/** Tighter padding once the label is hidden. */
export function iconPad(compact: number, hideAt: number): React.CSSProperties {
  return compact >= hideAt ? { padding: "4px 6px" } : {};
}
