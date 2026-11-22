import * as Blockly from "blockly/core";
import { findScene, findSceneWidget, sceneList } from "../../scene/registry";
import {
  CHECK_KINDS, EVENT_KINDS, ITEM_KINDS, KIND_LABEL, type SceneKind,
} from "../../scene/model";

export const SCENE_COLOUR = "300";

/** Widget kinds each widget field accepts. */
export const SCENE_FIELD_KINDS = {
  any: null,
  text: ["label", "button", "checkbox", "textarea", "qrcode"],
  setValue: ["bar", "arc", "slider", "roller", "dropdown", "tabview"],
  getValue: ["bar", "arc", "slider", "roller", "dropdown", "tabview", "list"],
  choice: ["list", "roller", "dropdown", "tabview"],
  items: ITEM_KINDS,
  check: CHECK_KINDS,
  checked: ["checkbox", "switch"],
  focus: ["button", "list", "roller", "dropdown", "slider", "checkbox", "switch", "scrollbox"],
  event: EVENT_KINDS,
  chart: ["chart"],
} as const satisfies Record<string, readonly SceneKind[] | null>;
export type SceneFieldKinds = keyof typeof SCENE_FIELD_KINDS;

/** "menu.label0" → ["menu", "label0"] (module paths may contain dots). */
export function splitWidgetRef(v: string): [string, string] {
  const i = v.lastIndexOf(".");
  return i < 0 ? ["", v] : [v.slice(0, i), v.slice(i + 1)];
}

/**
 * Dropdown of the project's scenes ("menu") or scene widgets ("menu.label0",
 * filtered by kind). Like the remote name field it keeps any value, so a
 * block survives a deleted widget; such values show as "(not defined)".
 */
export class FieldSceneRef extends Blockly.FieldDropdown {
  readonly what: "scene" | "widget";
  readonly kinds: SceneFieldKinds;

  constructor(what: "scene" | "widget", kinds: SceneFieldKinds = "any", value?: string) {
    super(() => [["(none)", ""]]);
    this.what = what;
    this.kinds = kinds;
    this.setValue(value ?? this.choices()[0]?.[1] ?? "");
  }

  static override fromJson(
    options: Blockly.FieldDropdownFromJsonConfig & { what?: "scene" | "widget"; kinds?: SceneFieldKinds; value?: string },
  ): FieldSceneRef {
    return new FieldSceneRef(options.what === "scene" ? "scene" : "widget", options.kinds ?? "any", options.value);
  }

  private choices(): [string, string][] {
    if (this.what === "scene") return sceneList().map((s) => [s.module, s.module]);
    const allowed = SCENE_FIELD_KINDS[this.kinds] as readonly SceneKind[] | null;
    return sceneList().flatMap((s) =>
      s.widgets.filter((w) => !allowed || allowed.includes(w.kind)).map((w): [string, string] => [`${s.module}.${w.name}`, `${s.module}.${w.name}`]));
  }

  override getOptions(): Blockly.MenuOption[] {
    const opts: Blockly.MenuOption[] = this.choices();
    const cur = this.getValue();
    if (cur && !opts.some((o) => o[1] === cur)) opts.push([`${cur} (not defined)`, cur]);
    if (!opts.length) opts.push(["(none)", ""]);
    return opts;
  }

  protected override getText_(): string | null {
    const v = this.getValue();
    if (!v) return "(none)";
    return this.problem() ? `${v} (not defined)` : v;
  }

  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === "string" ? newValue : null;
  }

  /** Why the value doesn't work, or null. */
  problem(): string | null {
    const v = this.getValue();
    if (!v) return this.what === "scene" ? "Pick a scene." : "Pick a scene widget.";
    if (this.what === "scene") return findScene(v) ? null : `There is no scene "${v}".`;
    const [m, name] = splitWidgetRef(v);
    if (!findScene(m)) return `There is no scene "${m}".`;
    const w = findSceneWidget(m, name);
    if (!w) return `Scene "${m}" has no widget "${name}".`;
    const allowed = SCENE_FIELD_KINDS[this.kinds] as readonly SceneKind[] | null;
    if (allowed && !allowed.includes(w.kind)) return `"${name}" is a ${KIND_LABEL[w.kind].toLowerCase()}: this block doesn't work with it.`;
    return null;
  }
}

/** Event reporter blocks: valid inside "when … is used" only. */
export const SCENE_EVENT_REPORTERS = ["scene_event_index", "scene_event_text", "scene_event_value"];

let registered = false;
export function registerSceneField(): void {
  if (registered) return;
  registered = true;
  Blockly.fieldRegistry.register("field_scene_ref", FieldSceneRef);
  Blockly.Extensions.register("scene_ref_warning", function (this: Blockly.Block) {
    this.setOnChange(function (this: Blockly.Block) {
      if (this.isInFlyout) return;
      const f = this.getField("SCENE") ?? this.getField("WIDGET");
      if (!(f instanceof FieldSceneRef)) return;
      this.setWarningText(f.problem());
    });
  });
  Blockly.Extensions.register("scene_event_reporter_warning", function (this: Blockly.Block) {
    this.setOnChange(function (this: Blockly.Block) {
      if (this.isInFlyout) return;
      let b: Blockly.Block | null = this.getSurroundParent();
      while (b && b.type !== "scene_on_event") b = b.getSurroundParent();
      this.setWarningText(b ? null : "Use this inside a \"when … is used\" block.");
    });
  });
}

const widget = (kinds: SceneFieldKinds) => ({ type: "field_scene_ref", name: "WIDGET", what: "widget", kinds });
const scene = { type: "field_scene_ref", name: "SCENE", what: "scene" };
const stmt = { previousStatement: null, nextStatement: null, colour: SCENE_COLOUR, inputsInline: true };

export const SCENE_BLOCKS = [
  { type: "scene_show", message0: "show scene %1", args0: [scene], ...stmt, extensions: ["scene_ref_warning"],
    tooltip: "Show the scene (everything else on the screen is hidden) and let the hub buttons use its widgets." },
  { type: "scene_hide", message0: "hide scene %1", args0: [scene], ...stmt, extensions: ["scene_ref_warning"],
    tooltip: "Hide the scene." },
  { type: "scene_is_shown", message0: "scene %1 is shown", args0: [scene], output: "Boolean", colour: SCENE_COLOUR, extensions: ["scene_ref_warning"],
    tooltip: "True while the scene is visible." },
  { type: "scene_set_text", message0: "set text of %1 to %2", args0: [widget("text"), { type: "input_value", name: "TEXT", check: "String" }], ...stmt,
    extensions: ["scene_ref_warning"], tooltip: "Change the text of a label, button, checkbox, text box or QR code." },
  { type: "scene_set_value", message0: "set value of %1 to %2", args0: [widget("setValue"), { type: "input_value", name: "VALUE", check: "Number" }], ...stmt,
    extensions: ["scene_ref_warning"], tooltip: "Bar / arc / slider: the value. Roller / dropdown: the selected item (0 = first). Tabs: the active tab." },
  { type: "scene_get_value", message0: "value of %1", args0: [widget("getValue")], output: "Number", colour: SCENE_COLOUR,
    extensions: ["scene_ref_warning"], tooltip: "Bar / arc / slider: the value. Menu list / roller / dropdown: the selected item (0 = first, -1 = none). Tabs: the active tab." },
  { type: "scene_selected_text", message0: "selected text of %1", args0: [widget("choice")], output: "String", colour: SCENE_COLOUR,
    extensions: ["scene_ref_warning"], tooltip: "Text of the selected item of a menu list, roller, dropdown or the active tab." },
  { type: "scene_set_items", message0: "set items of %1 to %2", args0: [widget("items"), { type: "input_value", name: "ITEMS", check: "Array" }], ...stmt,
    extensions: ["scene_ref_warning"], tooltip: "Replace the options of a menu list, roller or dropdown with a list of texts." },
  { type: "scene_set_checked", message0: "set %1 on %2", args0: [widget("check"), { type: "input_value", name: "STATE", check: "Boolean" }], ...stmt,
    extensions: ["scene_ref_warning"], tooltip: "Tick / untick a checkbox, switch a switch, or turn an LED on / off." },
  { type: "scene_is_checked", message0: "%1 is on", args0: [widget("checked")], output: "Boolean", colour: SCENE_COLOUR,
    extensions: ["scene_ref_warning"], tooltip: "True when the checkbox is ticked / the switch is on." },
  { type: "scene_set_color", message0: "set %1 of %2 to %3",
    args0: [{ type: "field_dropdown", name: "PART", options: [["colour", "MAIN"], ["background", "BG"]] }, widget("any"), { type: "input_value", name: "COLOR", check: "Number" }],
    ...stmt, extensions: ["scene_ref_warning"], tooltip: "Colour: text / indicator / line / LED colour (as in the scene editor). Background: the widget's background." },
  { type: "scene_set_visible", message0: "%1 %2",
    args0: [{ type: "field_dropdown", name: "SHOW", options: [["show", "SHOW"], ["hide", "HIDE"]] }, widget("any")],
    ...stmt, extensions: ["scene_ref_warning"], tooltip: "Show or hide one widget of a scene." },
  { type: "scene_move", message0: "move %1 to x %2 y %3",
    args0: [widget("any"), { type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }],
    ...stmt, extensions: ["scene_ref_warning"], tooltip: "Move a widget (position inside its parent, in pixels)." },
  { type: "scene_focus", message0: "focus %1", args0: [widget("focus")], ...stmt, extensions: ["scene_ref_warning"],
    tooltip: "Move the button focus to this widget (its scene must be shown)." },
  { type: "scene_chart_add", message0: "add %1 to chart %2", args0: [{ type: "input_value", name: "VALUE", check: "Number" }, widget("chart")], ...stmt,
    extensions: ["scene_ref_warning"], tooltip: "Add a value to the right of a chart (the oldest one scrolls out)." },
  { type: "scene_chart_points", message0: "set number of points of chart %1 to %2", args0: [widget("chart"), { type: "input_value", name: "COUNT", check: "Number" }], ...stmt,
    extensions: ["scene_ref_warning"], tooltip: "How many points / bars the chart shows (at least 2)." },
  {
    type: "scene_on_event",
    message0: "when %1 is used %2 %3",
    args0: [widget("event"), { type: "input_dummy" }, { type: "input_statement", name: "DO" }],
    colour: SCENE_COLOUR,
    extensions: ["scene_ref_warning"],
    tooltip: "Runs when the widget is used with the hub buttons: a button is pressed, a menu item / roller / dropdown option / tab is picked, a slider moves, a checkbox or switch changes. Needs a loop that keeps the screen updating.",
  },
  { type: "scene_event_index", message0: "picked item number", output: "Number", colour: SCENE_COLOUR, extensions: ["scene_event_reporter_warning"],
    tooltip: "Inside \"when … is used\": the picked menu item / option / tab (0 = first)." },
  { type: "scene_event_text", message0: "picked item text", output: "String", colour: SCENE_COLOUR, extensions: ["scene_event_reporter_warning"],
    tooltip: "Inside \"when … is used\": text of the picked menu item / option / tab." },
  { type: "scene_event_value", message0: "new value", output: null, colour: SCENE_COLOUR, extensions: ["scene_event_reporter_warning"],
    tooltip: "Inside \"when … is used\": the slider value, or True / False for a checkbox or switch." },
] as const;
