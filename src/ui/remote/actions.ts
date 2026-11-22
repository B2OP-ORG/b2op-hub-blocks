import { Gauge, Hash, Joystick, Lightbulb, MousePointerClick, SlidersHorizontal, TextCursorInput, ToggleRight, type LucideIcon } from "lucide-react";
import { useApp } from "../../state/store";
import { showAlert, showList, showPrompt } from "../dialog";
import {
  CONTROL_KINDS, DEFAULT_REMOTE_FILE, INDICATOR_KINDS, KIND_LABEL, emptyLayout, freeSpot, isRemoteFile, makeWidget,
  nameProblem, parseLayout, projectSymbols, serializeLayout, widgetSymbols, type RemoteSymbol, type WidgetKind,
} from "../../remote/layout";
import { setCreateRemoteNameHandler } from "../../remote/registry";

/** The project's remote controller layout file (the first `.remote`), creating the default one if asked. */
function layoutFile(create: boolean): string | null {
  const s = useApp.getState();
  const existing = s.mfp.files.find((f) => isRemoteFile(f.name));
  if (existing) return existing.id;
  if (!create) return null;
  const [id] = s.addFilesToProject(s.mfp.id, [{ name: DEFAULT_REMOTE_FILE, content: serializeLayout(emptyLayout()) }], false);
  return id ?? null;
}

/** Open the project's remote controller (created on first use). */
export function openRemoteController(): void {
  const id = layoutFile(true);
  if (id) useApp.getState().openFile(id);
}

export const KIND_HINT: Record<WidgetKind, string> = {
  slider: "control · int or float",
  switch: "control · bool",
  button: "control · bool, True while held",
  joystick: "control · two ints, name_x / name_y",
  text_input: "control · str",
  display: "indicator · number, bool or text",
  led: "indicator · bool",
  gauge: "indicator · number as bar or dial",
};

/** Palette icon per widget kind. */
export const KIND_ICON: Record<WidgetKind, LucideIcon> = {
  slider: SlidersHorizontal,
  switch: ToggleRight,
  button: MousePointerClick,
  joystick: Joystick,
  text_input: TextCursorInput,
  display: Hash,
  led: Lightbulb,
  gauge: Gauge,
};

/** Palette groups. */
export const PALETTE_CATEGORIES: { id: string; title: string; kinds: WidgetKind[] }[] = [
  { id: "controls", title: "Controls", kinds: CONTROL_KINDS },
  { id: "indicators", title: "Indicators", kinds: INDICATOR_KINDS },
];

/**
 * "Create remote name…" from the block toolbox: pick a widget kind and a name,
 * then add that widget to the project's layout so the name is defined everywhere.
 */
export async function createRemoteNameFlow(): Promise<RemoteSymbol | null> {
  const kind = await showList(
    "New remote name",
    [...CONTROL_KINDS, ...INDICATOR_KINDS].map((k) => ({ value: k, label: KIND_LABEL[k], detail: KIND_HINT[k] })),
    "Controls are values your program reads; indicators show values your program sends. The widget is added to the remote controller.",
  ) as WidgetKind | null;
  if (!kind) return null;
  // Controls and indicators share one set of names.
  const taken = new Set(projectSymbols(useApp.getState().mfp.files).map((s) => s.name));
  const name = await showPrompt(`New ${KIND_LABEL[kind].toLowerCase()}`, "", {
    placeholder: "name",
    confirmLabel: "Create",
    validate: (v) => nameProblem(v.trim(), kind) ?? (taken.has(v.trim()) ? `There is already a control or indicator called "${v.trim()}".` : null),
  });
  if (name === null) return null;
  const id = layoutFile(true);
  const st = useApp.getState();
  const file = st.mfp.files.find((f) => f.id === id);
  if (!file) return null;
  let layout;
  try {
    layout = parseLayout(file.content);
  } catch (e) {
    await showAlert(`Can't change ${file.name}`, (e as Error).message);
    return null;
  }
  const spot = freeSpot(layout);
  const w = makeWidget(kind, spot.x, spot.y, projectSymbols(st.mfp.files), name.trim());
  st.updateFile(file.id, serializeLayout({ ...layout, widgets: [...layout.widgets, w] }));
  return widgetSymbols(w, file.name)[0] ?? null;
}

setCreateRemoteNameHandler(createRemoteNameFlow);
