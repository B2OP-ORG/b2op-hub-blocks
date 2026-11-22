// Edits of a scene document, written back to its file (header + generated Python).

import { SCREEN_H, childrenOf, isContainer, makeWidget, subtree, withSceneHeader, type SceneDoc, type SceneKind, type SceneWidget } from "../../scene/model";
import { absolutePos, clampedPos, contentOffset, drawnSize } from "../../scene/geometry";
import { sceneToPython } from "../../scene/codegen";
import { moveWidget, type TreeDrop } from "../../scene/reorder";
import type { DrawResult } from "./DrawOverlay";
import { commitEdit } from "../hooks/useUndoRedo";

export function sceneOps(doc: SceneDoc, fileId: string, module: string, selected: string | null, setSelected: (uid: string | null) => void) {
  /** Write `next` to the file as one undo step (`coalesceKey`: merge quick repeats, see editHistory). */
  const commitDoc = (next: SceneDoc, coalesceKey?: string) =>
    commitEdit(fileId, withSceneHeader(next, sceneToPython(next, module)), selected, coalesceKey);
  const commit = (widgets: SceneWidget[], coalesceKey?: string) => commitDoc({ ...doc, widgets }, coalesceKey);

  /**
   * Merge `patch` into a widget; `undefined` values remove the key. `coalesce`:
   * quick repeats of the same change (nudges, colour drags) are one undo step.
   */
  const update = (uid: string, patch: Partial<SceneWidget>, coalesce = false) =>
    commit(doc.widgets.map((w) => {
      if (w.uid !== uid) return w;
      const n = { ...w, ...patch };
      for (const k of Object.keys(patch) as (keyof SceneWidget)[]) if (patch[k] === undefined) delete n[k];
      return n;
    }), coalesce ? `${uid}:${Object.keys(patch).sort().join(",")}` : undefined);

  /** Delete a widget and everything inside it. */
  const remove = (uid: string) => {
    const gone = subtree(doc, uid);
    commit(doc.widgets.filter((w) => !gone.has(w.uid)));
    setSelected(null);
  };

  const add = (kind: SceneKind, x: number, y: number, parent?: string, tab?: number, clamp = true) => {
    const w = makeWidget(kind, x, y, doc, parent, tab);
    // Clicks land (as far as it fits) inside the parent / screen; drops stay where they were dropped.
    if (clamp) Object.assign(w, clampedPos(doc, w));
    commit([...doc.widgets, w]);
    setSelected(w.uid);
  };

  /** Deepest container whose content area contains the screen point (x, y). */
  const containerAt = (x: number, y: number): { parent?: string; tab?: number; x: number; y: number } => {
    let best: { parent?: string; tab?: number; x: number; y: number; depth: number } = { x, y, depth: -1 };
    for (const w of doc.widgets) {
      if (!isContainer(w.kind)) continue;
      const a = absolutePos(doc, w), off = contentOffset(w);
      const cx = a.x + off.x, cy = a.y + off.y;
      if (x < cx || y < cy || x > a.x + w.w || y > a.y + w.h) continue;
      let depth = 0;
      for (let q = w; q.parent; depth++) q = doc.widgets.find((o) => o.uid === q.parent) ?? ({} as SceneWidget);
      if (depth > best.depth) best = { parent: w.uid, tab: w.kind === "tabview" ? w.value ?? 0 : undefined, x: x - cx, y: y - cy, depth };
    }
    return best;
  };

  return {
    commitDoc,
    commit,
    update,
    remove,
    add,

    /** Add a widget whose top-left is (offX, offY) up-left of screen point (px, py), in the container under that point. */
    addAt: (kind: SceneKind, px: number, py: number, offX = 0, offY = 0) => {
      const c = containerAt(px, py);
      add(kind, Math.round(c.x - offX), Math.round(c.y - offY), c.parent, c.tab, false);
    },

    /** A shape drawn with a draw tool (screen coordinates), in the container under its top-left corner. */
    addShape: (r: DrawResult) => {
      if (r.kind === "line") {
        const mx = Math.min(...r.points.map((q) => q[0])), my = Math.min(...r.points.map((q) => q[1]));
        const c = containerAt(mx, my);
        const w = makeWidget("line", 0, 0, doc, c.parent, c.tab);
        // LVGL draws the points relative to the line's position, stroke centred on them.
        Object.assign(w, { x: Math.round(c.x), y: Math.round(c.y), points: r.points.map(([x, y]) => [x - mx, y - my]) });
        if (r.closed) w.closed = true;
        commit([...doc.widgets, w]);
        setSelected(w.uid);
        return;
      }
      const c = containerAt(r.x, r.y);
      const w = makeWidget(r.kind, Math.round(c.x), Math.round(c.y), doc, c.parent, c.tab);
      Object.assign(w, { w: Math.max(2, Math.round(r.w)), h: Math.max(2, Math.round(r.h)) });
      commit([...doc.widgets, w]);
      setSelected(w.uid);
    },

    /** Palette click: into the selected container (or the screen), below the lowest sibling if it fits. */
    addDefault: (kind: SceneKind) => {
      const sel = doc.widgets.find((w) => w.uid === selected);
      const parent = sel && isContainer(sel.kind) ? sel : undefined;
      const tab = parent?.kind === "tabview" ? parent.value ?? 0 : undefined;
      // Below the lowest sibling when it still fits, else cascade from the top-left.
      const sibs = childrenOf(doc, parent?.uid, tab);
      const bottom = sibs.reduce((m, w) => Math.max(m, w.y + drawnSize(w).h), 0);
      const h = (parent ? parent.h - contentOffset(parent).y : SCREEN_H);
      const fits = bottom + 4 + (makeWidget(kind, 0, 0, doc).h || 0) <= h;
      const n = sibs.length;
      add(kind, fits ? 4 : 4 + (n % 8) * 6, fits ? (sibs.length ? bottom + 4 : 4) : 4 + (n % 8) * 6, parent?.uid, tab);
    },

    /** Outline drag & drop: reorder and / or move into another container. */
    moveTo: (uid: string, drop: TreeDrop) => {
      const next = moveWidget(doc, uid, drop);
      if (next) commitDoc(next);
    },

    /** Swap a widget with its previous / next sibling (draw + focus order). */
    moveZ: (uid: string, dir: -1 | 1) => {
      const w = doc.widgets.find((x) => x.uid === uid);
      if (!w) return;
      const sibs = doc.widgets.filter((x) => x.parent === w.parent);
      const i = sibs.indexOf(w), j = i + dir;
      if (j < 0 || j >= sibs.length) return;
      const other = sibs[j];
      const list = [...doc.widgets];
      const a = list.indexOf(w), b = list.indexOf(other);
      [list[a], list[b]] = [list[b], list[a]];
      commit(list);
    },
  };
}
