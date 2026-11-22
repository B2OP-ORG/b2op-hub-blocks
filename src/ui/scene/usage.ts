import { EVENT_KINDS, eventArgs, type SceneWidget } from "../../scene/model";

/** Example Python for a scene widget (shown in its "In Python" box). */
export function usageFor(w: SceneWidget, module: string): string {
  const v = `${module}.${w.name}`;
  const ev = EVENT_KINDS.includes(w.kind) ? [`${module}.on("${w.name}", lambda ${eventArgs(w.kind).join(", ")}: ...)`] : [];
  switch (w.kind) {
    case "label": case "checkbox": case "textarea": return [`${v}.set_text("Hello")`, ...ev].join("\n");
    case "button": return [`${v}_label.set_text("Go")`, ...ev].join("\n");
    case "bar": case "slider": return [`${v}.set_value(42, False)`, `${v}.get_value()`, ...ev].join("\n");
    case "arc": return `${v}.set_value(42)`;
    case "arcline": return `${v}.set_bg_angles(180, 270)\n${v}.set_style_arc_color(lv.color_hex(0xFF0000), 0)`;
    case "rect": case "ellipse": case "panel": return `${v}.set_style_bg_color(lv.color_hex(0xFF0000), 0)\n${v}.add_flag(lv.obj.FLAG.HIDDEN)`;
    case "line": return `${v}.set_style_line_color(lv.color_hex(0xFF0000), 0)`;
    case "qrcode": return `${module}.set_qr("${w.name}", "https://example.com")`;
    case "led": return `${v}.on()\n${v}.off()`;
    case "list": case "roller": case "dropdown": return [`${module}.set_items("${w.name}", ["A", "B"])`, `${module}.selected_text("${w.name}")`, ...ev].join("\n");
    case "chart": return `${v}.set_next_value(${v}_series, 42)\n${v}.set_point_count(20)`;
    case "tabview": return [`${v}.set_active(1, False)`, ...ev].join("\n");
    case "switch": return [`${v}.add_state(lv.STATE.CHECKED)`, ...ev].join("\n");
    default: return `${v}.add_flag(lv.obj.FLAG.HIDDEN)`;
  }
}
