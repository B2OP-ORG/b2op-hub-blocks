// Scene preview: what the hub buttons do (focus order, edit mode, events),
// simulated on a local copy of the scene.

import { creationOrder, subtree, type SceneDoc, type SceneKind, type SceneWidget } from "../../scene/model";

export type Stop = { uid: string; item?: number };
export type PreviewKey = "up" | "down" | "enter" | "left";

/** Local copy of the scene, the focus stop, edit mode and the last event. */
export interface PreviewState {
  doc: SceneDoc;
  focus: number;
  editing: boolean;
  log: string;
}

export function startPreviewState(doc: SceneDoc): PreviewState {
  return { doc: structuredClone(doc), focus: 0, editing: false, log: "↑ ↓ move focus · Enter = center · ← / Esc leaves edit mode" };
}

/** Focusable stops in hub order (list / tab view items count separately). */
export function focusStops(doc: SceneDoc): Stop[] {
  const out: Stop[] = [];
  const hiddenSet = new Set<string>();
  for (const w of doc.widgets) if (w.hidden) for (const u of subtree(doc, w.uid)) hiddenSet.add(u);
  for (const w of creationOrder(doc)) {
    if (hiddenSet.has(w.uid)) continue;
    // Widgets on inactive tabs can't take focus.
    const parent = w.parent ? doc.widgets.find((o) => o.uid === w.parent) : undefined;
    if (parent?.kind === "tabview" && (w.tab ?? 0) !== (parent.value ?? 0)) continue;
    if (w.kind === "list") (w.items ?? []).forEach((_, i) => out.push({ uid: w.uid, item: i }));
    else if (w.kind === "tabview") (w.items ?? ["Tab"]).forEach((_, i) => out.push({ uid: w.uid, item: i }));
    else if (["button", "roller", "dropdown", "slider", "checkbox", "switch", "scrollbox"].includes(w.kind)) out.push({ uid: w.uid });
  }
  return out;
}

const EDITABLE: SceneKind[] = ["roller", "dropdown", "slider", "scrollbox"];

/** Keyboard map: arrows / Enter / Space / Esc → hub buttons. */
export const PREVIEW_KEYS: Record<string, PreviewKey> = {
  ArrowUp: "up", ArrowDown: "down", Enter: "enter", " ": "enter", ArrowRight: "enter", ArrowLeft: "left", Escape: "left",
};

/** The preview after pressing a hub button (unchanged object when nothing happens). */
export function applyPreviewKey(preview: PreviewState, key: PreviewKey, module: string): PreviewState {
  const stops = focusStops(preview.doc);
  const pd = preview.doc;
  const st = stops[preview.focus];
  const w = st ? pd.widgets.find((x) => x.uid === st.uid) : undefined;
  const set = (patch: Partial<SceneWidget>, log?: string): PreviewState =>
    ({ ...preview, doc: w ? { ...pd, widgets: pd.widgets.map((x) => (x.uid === w.uid ? { ...x, ...patch } : x)) } : pd, log: log ?? preview.log });
  const ev = (args: string) => `${module}.on("${w?.name}") → cb(${args})`;
  if (key === "left") return preview.editing ? { ...preview, editing: false, log: "left: leave edit mode" } : preview;
  if (preview.editing && w) {
    const d = key === "up" ? 1 : key === "down" ? -1 : 0;
    if (key === "enter") return { ...preview, editing: false, log: w.kind === "roller" || w.kind === "dropdown" ? ev(`${w.value ?? 0}, "${w.items?.[w.value ?? 0] ?? ""}"`) : "leave edit mode" };
    if (w.kind === "roller" || w.kind === "dropdown") {
      const v = Math.min(Math.max(0, (w.value ?? 0) + d), Math.max(0, (w.items?.length ?? 1) - 1));
      return set({ value: v }, ev(`${v}, "${w.items?.[v] ?? ""}"`));
    }
    if (w.kind === "slider") {
      const step = Math.max(1, Math.round(((w.max ?? 100) - (w.min ?? 0)) / 20));
      const v = Math.min(w.max ?? 100, Math.max(w.min ?? 0, (w.value ?? 0) + d * step));
      return set({ value: v }, ev(String(v)));
    }
    return preview;
  }
  if (key === "up" || key === "down") {
    if (!stops.length) return preview;
    const n = (preview.focus + (key === "up" ? 1 : -1) + stops.length) % stops.length;
    return { ...preview, focus: n };
  }
  if (!w || !st) return preview;
  if (EDITABLE.includes(w.kind)) return { ...preview, editing: true, log: `${w.name}: edit mode (↑ ↓ change, Enter / ← done)` };
  switch (w.kind) {
    case "button": return { ...preview, log: ev("") };
    case "checkbox": case "switch": return set({ checked: !w.checked }, ev(w.checked ? "False" : "True"));
    case "list": return { ...preview, log: ev(`${st.item}, "${w.items?.[st.item ?? 0] ?? ""}"`) };
    case "tabview": return set({ value: st.item }, ev(`${st.item}, "${w.items?.[st.item ?? 0] ?? ""}"`));
    default: return preview;
  }
}
