// Moving a widget in the scene tree (outline drag & drop): reorder among its
// siblings and/or move it into another container (or onto the screen).

import { isContainer, subtree, type SceneDoc, type SceneWidget } from "./model";
import { absolutePos, clampedPos, contentOffset } from "./geometry";

/** Where to drop: before / after a widget (as its sibling), or last inside a container (undefined = the screen). */
export type TreeDrop =
  | { at: "before" | "after"; uid: string }
  | { at: "into"; parent: string | undefined };

/** Can `uid` be dropped there? Not onto / into itself or its own children. */
export function canDrop(doc: SceneDoc, uid: string, drop: TreeDrop): boolean {
  const own = subtree(doc, uid);
  if (drop.at === "into") {
    if (drop.parent === undefined) return true;
    const p = doc.widgets.find((w) => w.uid === drop.parent);
    return !!p && isContainer(p.kind) && !own.has(p.uid);
  }
  return !own.has(drop.uid) && doc.widgets.some((w) => w.uid === drop.uid);
}

/**
 * Move widget `uid` (with everything inside it: children follow through their
 * `parent` link). On a new parent / tab it keeps its place on the screen, as
 * far as it fits. Returns null when the drop isn't possible or changes nothing.
 */
export function moveWidget(doc: SceneDoc, uid: string, drop: TreeDrop): SceneDoc | null {
  const w = doc.widgets.find((x) => x.uid === uid);
  if (!w || !canDrop(doc, uid, drop)) return null;

  const target = drop.at === "into" ? undefined : doc.widgets.find((x) => x.uid === drop.uid);
  const parent = drop.at === "into" ? drop.parent : target?.parent;
  const parentW = parent ? doc.widgets.find((x) => x.uid === parent) : undefined;

  const moved: SceneWidget = { ...w };
  if (parent) moved.parent = parent; else delete moved.parent;
  // On a tab view: the sibling's tab, else the tab currently shown.
  if (parentW?.kind === "tabview") moved.tab = target ? target.tab ?? 0 : parentW.value ?? 0;
  else delete moved.tab;

  const rest = doc.widgets.filter((x) => x.uid !== uid);
  if (moved.parent !== w.parent || moved.tab !== w.tab) {
    // Same place on screen, relative to the new parent's content area.
    const abs = absolutePos(doc, w);
    let ox = 0, oy = 0;
    if (parentW) {
      const pa = absolutePos(doc, parentW), off = contentOffset(parentW);
      ox = pa.x + off.x; oy = pa.y + off.y;
    }
    moved.x = abs.x - ox;
    moved.y = abs.y - oy;
    Object.assign(moved, clampedPos({ ...doc, widgets: [...rest, moved] }, moved));
  }

  const idx = drop.at === "into"
    ? rest.length
    : rest.findIndex((x) => x.uid === drop.uid) + (drop.at === "after" ? 1 : 0);
  const widgets = [...rest.slice(0, idx), moved, ...rest.slice(idx)];

  const unchanged = widgets.every((x, i) => x.uid === doc.widgets[i].uid)
    && moved.parent === w.parent && moved.tab === w.tab && moved.x === w.x && moved.y === w.y;
  return unchanged ? null : { ...doc, widgets };
}
