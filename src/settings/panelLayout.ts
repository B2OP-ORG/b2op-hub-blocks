// Where the scene / remote editors put their tool panels around the canvas.
//
// Serialized as columns left → right separated by "|"; tools stacked in one
// column (top → bottom) are joined with "-". The canvas is a column of its own:
//   "palette|canvas|outline-properties"  palette left; outline over properties right
//   "outline|properties|canvas|palette"  three separate columns

export type PanelTool = "outline" | "properties" | "palette";
export type LayoutItem = PanelTool | "canvas";
/** Columns left → right; each column lists its items top → bottom. */
export type PanelLayout = LayoutItem[][];

export const PANEL_TOOLS: PanelTool[] = ["outline", "properties", "palette"];
export const PANEL_TOOL_LABEL: Record<PanelTool, string> = { outline: "Outline", properties: "Properties", palette: "Palette" };
export const DEFAULT_PANEL_LAYOUT = "palette|canvas|outline-properties";

const ITEMS: LayoutItem[] = ["canvas", ...PANEL_TOOLS];

export function serializePanelLayout(layout: PanelLayout): string {
  return layout.map((col) => col.join("-")).join("|");
}

/** Parse a stored layout; anything invalid (unknown / missing / repeated item, canvas stacked) gives the default. */
export function parsePanelLayout(s: unknown): PanelLayout {
  const fallback = () => DEFAULT_PANEL_LAYOUT.split("|").map((c) => c.split("-") as LayoutItem[]);
  if (typeof s !== "string") return fallback();
  const cols = s.split("|").map((c) => c.split("-"));
  const flat = cols.flat();
  if (flat.length !== ITEMS.length || ITEMS.some((i) => !flat.includes(i))) return fallback();
  if (cols.some((c) => c.includes("canvas") && c.length > 1)) return fallback();
  return cols as LayoutItem[][];
}

/** Normalize a stored layout string (invalid → default). */
export function normalizePanelLayout(s: unknown): string {
  return serializePanelLayout(parsePanelLayout(s));
}

/**
 * Tool columns left and right of the canvas, outermost first on the left and
 * innermost first on the right (i.e. both in screen order). Tools the editor
 * doesn't have are dropped, and so are columns left empty.
 */
export function panelSides(layout: PanelLayout, available: readonly PanelTool[]): { left: PanelTool[][]; right: PanelTool[][] } {
  const at = layout.findIndex((c) => c.includes("canvas"));
  const keep = (cols: LayoutItem[][]) =>
    cols.map((c) => c.filter((t): t is PanelTool => t !== "canvas" && available.includes(t))).filter((c) => c.length > 0);
  return { left: keep(layout.slice(0, at)), right: keep(layout.slice(at + 1)) };
}

// ── Editing (settings UI) ──────────────────────────────────────────────────────
// Flat view: items in screen order; `stacked` = in the same column as the item before.

export interface FlatItem { item: LayoutItem; stacked: boolean }

export function flattenLayout(layout: PanelLayout): FlatItem[] {
  return layout.flatMap((col) => col.map((item, i) => ({ item, stacked: i > 0 })));
}

export function unflattenLayout(flat: FlatItem[]): PanelLayout {
  const cols: LayoutItem[][] = [];
  flat.forEach((f, i) => {
    // The canvas never shares a column; the first item starts one.
    const stack = i > 0 && f.stacked && f.item !== "canvas" && flat[i - 1].item !== "canvas";
    if (stack) cols[cols.length - 1].push(f.item);
    else cols.push([f.item]);
  });
  return cols;
}

/** Move a tool one place left / right (across the canvas, or within its stack). Join flags stay in place. */
export function moveTool(layout: PanelLayout, tool: PanelTool, dir: -1 | 1): PanelLayout {
  const flat = flattenLayout(layout);
  const i = flat.findIndex((f) => f.item === tool), j = i + dir;
  if (i < 0 || j < 0 || j >= flat.length) return layout;
  const next = flat.map((f) => ({ ...f }));
  [next[i].item, next[j].item] = [next[j].item, next[i].item];
  return unflattenLayout(next);
}

/** Stack the flat item at `index` with the one before it, or split them into separate columns. */
export function toggleStacked(layout: PanelLayout, index: number): PanelLayout {
  const flat = flattenLayout(layout);
  if (index <= 0 || index >= flat.length) return layout;
  flat[index] = { ...flat[index], stacked: !flat[index].stacked };
  return unflattenLayout(flat);
}
