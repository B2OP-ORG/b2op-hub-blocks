import type { SceneKind } from "../../scene/model";

/** CSS px per LCD px at 100% zoom. */
export const BASE = 3;
/** LCD px of canvas around the screen. */
export const MARGIN = 16;

/** Palette chip tooltips. */
export const KIND_HINT: Record<SceneKind, string> = {
  label: "text", panel: "coloured box / container", line: "line through points", bar: "progress bar",
  arc: "round gauge", led: "on / off light", spinner: "busy indicator", image: "PNG from the SD card",
  qrcode: "QR code of a text", chart: "line or bar chart", scale: "ruler with numbers", table: "grid of text",
  textarea: "multi-line text box", button: "press with center", list: "menu: up/down picks, center selects",
  roller: "option wheel", dropdown: "drop-down option list", slider: "adjustable value", checkbox: "tick box with text",
  switch: "on / off toggle", scrollbox: "container you scroll with up/down", tabview: "tabs holding other widgets",
};
