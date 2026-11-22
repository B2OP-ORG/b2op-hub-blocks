import {
  BatteryMedium, ChartLine, Circle, Gauge, GalleryVerticalEnd, Image as ImageIcon, LayoutPanelTop, Lightbulb, List, LoaderCircle,
  MousePointerClick, PanelsTopLeft, PenLine, QrCode, Rainbow, Ruler, ScrollText, Slash, SlidersHorizontal, Spline, Square,
  SquareCheck, SquareChevronDown, Table, TextCursorInput, ToggleRight, Type, type LucideIcon,
} from "lucide-react";
import type { SceneKind } from "../../scene/model";

/** CSS px per LCD px at 100% zoom. */
export const BASE = 3;
/** LCD px of canvas around the screen. */
export const MARGIN = 16;

/** Palette chip tooltips. */
export const KIND_HINT: Record<SceneKind, string> = {
  label: "text", panel: "coloured box / container", line: "line through points", bar: "progress bar",
  arc: "round gauge", led: "on / off light", spinner: "busy indicator", image: "PNG image",
  qrcode: "QR code of a text", chart: "line or bar chart", scale: "ruler with numbers", table: "grid of text",
  textarea: "multi-line text box", button: "press with center", list: "menu: up/down picks, center selects",
  roller: "option wheel", dropdown: "drop-down option list", slider: "adjustable value", checkbox: "tick box with text",
  switch: "on / off toggle", scrollbox: "container you scroll with up/down", tabview: "tabs holding other widgets",
  rect: "filled / outlined box", ellipse: "filled / outlined circle", arcline: "part of a circle outline",
};

/** Palette / outline icon per widget kind. */
export const KIND_ICON: Record<SceneKind, LucideIcon> = {
  label: Type, textarea: TextCursorInput, table: Table,
  bar: BatteryMedium, arc: Gauge, led: Lightbulb, spinner: LoaderCircle, chart: ChartLine, scale: Ruler,
  button: MousePointerClick, list: List, roller: GalleryVerticalEnd, dropdown: SquareChevronDown, slider: SlidersHorizontal,
  checkbox: SquareCheck, switch: ToggleRight,
  panel: LayoutPanelTop, scrollbox: ScrollText, tabview: PanelsTopLeft,
  image: ImageIcon, qrcode: QrCode,
  line: Slash, rect: Square, ellipse: Circle, arcline: Rainbow,
};

/** Palette label when it differs from KIND_LABEL (tells the gauge from the stroke). */
export const PALETTE_LABEL: Partial<Record<SceneKind, string>> = { arc: "Arc gauge" };

/** Draw tools: pick one, then draw on the screen. */
export type DrawTool = "line" | "polyline" | "pen" | "rect" | "ellipse" | "arcline";

export const DRAW_TOOLS: { tool: DrawTool; label: string; icon: LucideIcon; hint: string }[] = [
  { tool: "line", label: "Line", icon: Slash, hint: "Drag to draw a straight line (Shift: 45° steps)" },
  { tool: "polyline", label: "Polyline", icon: Spline, hint: "Click each point; right-click, double-click or Enter finishes (Backspace: undo point, Esc: cancel)" },
  { tool: "pen", label: "Pen", icon: PenLine, hint: "Draw freehand" },
  { tool: "rect", label: "Rectangle", icon: Square, hint: "Drag to draw a box (Shift: square)" },
  { tool: "ellipse", label: "Circle / oval", icon: Circle, hint: "Drag to draw a circle (Shift: round; LVGL draws ovals as pills)" },
  { tool: "arcline", label: "Arc stroke", icon: Rainbow, hint: "Drag the circle's box; set the angles in Properties" },
];

/** Palette categories (the Draw tools come first, separately). */
export const PALETTE_CATEGORIES: { id: string; title: string; kinds: SceneKind[] }[] = [
  { id: "text", title: "Text", kinds: ["label", "textarea", "table"] },
  { id: "indicators", title: "Indicators", kinds: ["bar", "arc", "led", "spinner", "chart", "scale"] },
  { id: "inputs", title: "Inputs (hub buttons)", kinds: ["button", "list", "roller", "dropdown", "slider", "checkbox", "switch"] },
  { id: "containers", title: "Containers", kinds: ["panel", "scrollbox", "tabview"] },
  { id: "media", title: "Media", kinds: ["image", "qrcode"] },
];

/** Property groups folded until opened (remembered per user, see useFoldState). */
export const PROP_FOLDED_BY_DEFAULT = ["points"];
