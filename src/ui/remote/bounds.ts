import { GRID, type Widget } from "../../remote/layout";

/** dataTransfer type of a palette chip being dragged onto the canvas. */
export const DND_TYPE = "application/x-b2op-remote-widget";
export const MIN_W = 64;
export const MIN_H = 48;

/** Widgets this close to the home view's right / bottom edge still count as inside (border, shadow, resize handle). */
export const MARGIN = GRID * 2;
/** Room added past a widget that sticks out of the home view, so a second drag can take it further. */
const EXTRA = GRID * 30;

/** Canvas area in layout units: the home view (0,0 + visible size) grown by EXTRA past any widget that sticks out. */
export type Bounds = { left: number; top: number; right: number; bottom: number };

export function canvasBounds(widgets: Widget[], viewW: number, viewH: number): Bounds {
  if (widgets.length === 0) return { left: 0, top: 0, right: viewW, bottom: viewH };
  const minX = Math.min(...widgets.map((w) => w.x)), minY = Math.min(...widgets.map((w) => w.y));
  const maxX = Math.max(...widgets.map((w) => w.x + w.w)), maxY = Math.max(...widgets.map((w) => w.y + w.h));
  return {
    left: minX < 0 ? minX - EXTRA : 0,
    top: minY < 0 ? minY - EXTRA : 0,
    right: maxX + MARGIN > viewW ? maxX + EXTRA : viewW,
    bottom: maxY + MARGIN > viewH ? maxY + EXTRA : viewH,
  };
}
