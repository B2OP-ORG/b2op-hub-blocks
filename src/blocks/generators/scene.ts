import type { Block } from "blockly";
import { Order, type PythonGenerator } from "blockly/python";
import { needsLvglImport } from "../setup";
import { coerceColor } from "./lvgl";
import { findScene, findSceneWidget } from "../../scene/registry";
import { eventArgs, type SceneKind } from "../../scene/model";
import { splitWidgetRef } from "../defs/scene";

type Defs = { definitions_: Record<string, string> };

/** `import <module>` (+ lvgl, so loops keep calling lv.timer_handler()). */
export function needsScene(gen: PythonGenerator, module: string): void {
  needsLvglImport(gen);
  (gen as unknown as Defs).definitions_[`scene_import_${module}`] = `import ${module}`;
}

/** Python names a scene event handler gets, plus lines defining the other reporter names. */
export function eventParams(kind: SceneKind | undefined, body: string): { params: string; prelude: string } {
  const uses = (n: string) => new RegExp(`\\b${n}\\b`).test(body);
  const args = kind ? eventArgs(kind) : [];
  const params = args.map((a) => `ev_${a}`);
  const prelude: string[] = [];
  if (!args.includes("index") && uses("ev_index")) prelude.push(args.includes("value") ? "ev_index = ev_value" : "ev_index = -1");
  if (!args.includes("text") && uses("ev_text")) prelude.push(args.includes("value") ? "ev_text = str(ev_value)" : 'ev_text = ""');
  if (!args.includes("value") && uses("ev_value")) prelude.push(args.includes("index") ? "ev_value = ev_index" : "ev_value = None");
  return { params: kind ? params.join(", ") : "*_args", prelude: prelude.map((l) => l + "\n").join("") };
}

export function registerSceneGenerators(gen: PythonGenerator): void {
  const val = (block: Block, name: string, def = "0") => gen.valueToCode(block, name, Order.NONE) || def;

  /**
   * Widget reference of a block: module, name, Python expression and kind.
   * Empty name (and no import) when the widget is deleted / not created yet.
   */
  const ref = (block: Block) => {
    const [module, name] = splitWidgetRef(block.getFieldValue("WIDGET") ?? "");
    const kind = module && name ? findSceneWidget(module, name)?.kind : undefined;
    if (!kind) return { module, name: "", w: "", kind };
    needsScene(gen, module);
    return { module, name, w: `${module}.${name}`, kind };
  };
  const missing = (block: Block) => `pass  # scene widget "${block.getFieldValue("WIDGET") ?? ""}" not found\n`;
  /** Scene module of a block, or "" (no import) when the scene doesn't exist. */
  const sceneOf = (block: Block) => {
    const m = block.getFieldValue("SCENE") ?? "";
    if (!m || !findScene(m)) return "";
    needsScene(gen, m);
    return m;
  };

  gen.forBlock["scene_show"] = (block: Block) => {
    const m = sceneOf(block);
    return m ? `${m}.show()\n` : `pass  # scene "${block.getFieldValue("SCENE") ?? ""}" not found\n`;
  };
  gen.forBlock["scene_hide"] = (block: Block) => {
    const m = sceneOf(block);
    return m ? `${m}.hide()\n` : `pass  # scene "${block.getFieldValue("SCENE") ?? ""}" not found\n`;
  };
  gen.forBlock["scene_is_shown"] = (block: Block) => {
    const m = sceneOf(block);
    return m ? [`${m}.is_shown()`, Order.FUNCTION_CALL] : ["False", Order.ATOMIC];
  };

  gen.forBlock["scene_set_text"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    const text = val(block, "TEXT", '""');
    switch (r.kind) {
      case "button": return `${r.w}_label.set_text(${text})\n`;
      case "qrcode": return `${r.module}.set_qr("${r.name}", ${text})\n`;
      default: return `${r.w}.set_text(${text})\n`;
    }
  };

  gen.forBlock["scene_set_value"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    const v = `int(${val(block, "VALUE")})`;
    switch (r.kind) {
      case "arc": return `${r.w}.set_value(${v})\n`;
      case "roller": return `${r.w}.set_selected(${v}, False)\n`;
      case "dropdown": return `${r.w}.set_selected(${v})\n`;
      case "tabview": return `${r.w}.set_active(${v}, False)\n`;
      default: return `${r.w}.set_value(${v}, False)\n`;
    }
  };

  gen.forBlock["scene_get_value"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return ["0", Order.ATOMIC];
    switch (r.kind) {
      case "list": return [`${r.module}.selected_index("${r.name}")`, Order.FUNCTION_CALL];
      case "roller": case "dropdown": return [`${r.w}.get_selected()`, Order.FUNCTION_CALL];
      case "tabview": return [`${r.w}.get_tab_active()`, Order.FUNCTION_CALL];
      default: return [`${r.w}.get_value()`, Order.FUNCTION_CALL];
    }
  };

  gen.forBlock["scene_selected_text"] = (block: Block) => {
    const r = ref(block);
    return r.name ? [`${r.module}.selected_text("${r.name}")`, Order.FUNCTION_CALL] : ['""', Order.ATOMIC];
  };

  gen.forBlock["scene_set_items"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    return `${r.module}.set_items("${r.name}", [str(_i) for _i in ${val(block, "ITEMS", "[]")}])\n`;
  };

  gen.forBlock["scene_set_checked"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    const on = val(block, "STATE", "True");
    if (r.kind === "led") return `if ${on}:\n${gen.INDENT}${r.w}.on()\nelse:\n${gen.INDENT}${r.w}.off()\n`;
    return `if ${on}:\n${gen.INDENT}${r.w}.add_state(lv.STATE.CHECKED)\nelse:\n${gen.INDENT}${r.w}.remove_state(lv.STATE.CHECKED)\n`;
  };

  gen.forBlock["scene_is_checked"] = (block: Block) => {
    const r = ref(block);
    return r.name ? [`${r.w}.has_state(lv.STATE.CHECKED)`, Order.FUNCTION_CALL] : ["False", Order.ATOMIC];
  };

  gen.forBlock["scene_set_color"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    const c = `lv.color_hex(${coerceColor(val(block, "COLOR"), "0xFFFFFF")})`;
    if (block.getFieldValue("PART") === "BG") {
      return `${r.w}.set_style_bg_color(${c}, 0)\n${r.w}.set_style_bg_opa(lv.OPA.COVER, 0)\n`;
    }
    switch (r.kind) {
      case "button": return `${r.w}_label.set_style_text_color(${c}, 0)\n`;
      case "bar": case "slider": return `${r.w}.set_style_bg_color(${c}, lv.PART.INDICATOR)\n`;
      case "arc": case "spinner": return `${r.w}.set_style_arc_color(${c}, lv.PART.INDICATOR)\n`;
      case "line": return `${r.w}.set_style_line_color(${c}, 0)\n`;
      case "led": return `${r.w}.set_color(${c})\n`;
      case "chart": return `${r.w}.set_series_color(${r.w}_series, ${c})\n`;
      case "roller": return `${r.w}.set_style_bg_color(${c}, lv.PART.SELECTED)\n`;
      case "switch": return `${r.w}.set_style_bg_color(${c}, lv.PART.INDICATOR | lv.STATE.CHECKED)\n`;
      case "qrcode": return `${r.w}.set_dark_color(${c})\n`;
      default: return `${r.w}.set_style_text_color(${c}, 0)\n`;
    }
  };

  gen.forBlock["scene_set_visible"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    return block.getFieldValue("SHOW") === "HIDE"
      ? `${r.w}.add_flag(lv.obj.FLAG.HIDDEN)\n`
      : `${r.w}.remove_flag(lv.obj.FLAG.HIDDEN)\n`;
  };

  gen.forBlock["scene_move"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    return `${r.w}.set_pos(int(${val(block, "X")}), int(${val(block, "Y")}))\n`;
  };

  gen.forBlock["scene_focus"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    // A menu list itself isn't focusable: focus its first item.
    return r.kind === "list" ? `lv.group_focus_obj(${r.w}_buttons[0])\n` : `lv.group_focus_obj(${r.w})\n`;
  };

  gen.forBlock["scene_chart_add"] = (block: Block) => {
    const r = ref(block);
    if (!r.name) return missing(block);
    return `${r.w}.set_next_value(${r.w}_series, int(${val(block, "VALUE")}))\n`;
  };

  // Top-level hat: emitted by workspaceToPython (like the button hats).
  gen.forBlock["scene_on_event"] = () => "";
  gen.forBlock["scene_event_index"] = () => ["ev_index", Order.ATOMIC];
  gen.forBlock["scene_event_text"] = () => ["ev_text", Order.ATOMIC];
  gen.forBlock["scene_event_value"] = () => ["ev_value", Order.ATOMIC];
}
