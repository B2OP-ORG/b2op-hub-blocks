// Scene → Python module. The output is the body of the scene file (below the
// `# __scene__:` header line) and is what runs on the hub: importing the
// module builds the scene, hidden, inside a full-screen container on the
// active screen; `show()` brings it up and gives it the button focus.
//
// Only `lvgl` is imported, so the module also works from plain Python files.

import { ARC_MODES, BAR_MODES, LONG_MODES, SCREEN_H, SCREEN_W, creationOrder, hexColor, type SceneDoc, type SceneWidget } from "./model";
import { arcStretch, contentOffset, effectiveCrop, linePoints, QR_CAPACITY_M, triangulate, widgetAngle } from "./geometry";

const I = "    ";
const py = (s: string) => JSON.stringify(s); // JSON string literals are valid Python literals
const pyList = (xs: string[]) => `[${xs.map(py).join(", ")}]`;
const color = (c: string | undefined, fallback?: string) => `lv.color_hex(${hexColor(c, fallback)})`;
const num = (n: number | undefined, d: number) => String(Math.round(Number.isFinite(n) ? (n as number) : d));

/** Python expression for the object a widget is created in. */
function parentExpr(doc: SceneDoc, w: SceneWidget): string {
  if (!w.parent) return "root";
  const p = doc.widgets.find((o) => o.uid === w.parent);
  if (!p) return "root";
  if (p.kind === "tabview") {
    const n = Math.max(1, p.items?.length ?? 1);
    return `${p.name}_tabs[${Math.min(Math.max(0, w.tab ?? 0), n - 1)}]`;
  }
  return p.name;
}

/** Lines that create + configure one widget. */
function widgetLines(doc: SceneDoc, w: SceneWidget): string[] {
  const v = w.name;
  const out: string[] = [];
  const L = (s: string) => out.push(s);
  const style = (prop: string, value: string, sel = "0") => L(`${v}.set_style_${prop}(${value}, ${sel})`);
  // Cropped arcs sit in a transparent container the size of the visible window:
  // LVGL clips children to their parent.
  const crop = effectiveCrop(w);
  let parent = parentExpr(doc, w);
  if (crop) {
    const c = `${v}_clip`;
    L(`# ${v} (cropped)`);
    L(`${c} = lv.obj(${parent})`);
    L(`${c}.set_pos(${num(w.x + crop.x, 0)}, ${num(w.y + crop.y, 0)})`);
    L(`${c}.set_size(${crop.w}, ${crop.h})`);
    for (const [prop, val] of [["pad_all", "0"], ["border_width", "0"], ["radius", "0"], ["bg_opa", "lv.OPA.TRANSP"]]) L(`${c}.set_style_${prop}(${val}, 0)`);
    L(`${c}.remove_flag(lv.obj.FLAG.SCROLLABLE)`);
    L(`${c}.remove_flag(lv.obj.FLAG.CLICKABLE)`);
    parent = c;
  }
  // Stretched arcs: a square arc of the smaller side, scaled to the box.
  const stretch = arcStretch(w);
  // Rotation turns the box around its centre. A cropped arc turns its clip container
  // (about the arc box centre); a stretched arc scales about its square's centre, so it moves to keep the box in place.
  const angle = widgetAngle(w);
  const stretchShift = stretch && angle && !crop ? { x: (w.w - stretch.s) / 2, y: (w.h - stretch.s) / 2 } : { x: 0, y: 0 };
  const pos = () => L(crop ? `${v}.set_pos(${-crop.x}, ${-crop.y})` : `${v}.set_pos(${num(w.x + stretchShift.x, 0)}, ${num(w.y + stretchShift.y, 0)})`);
  const size = () => L(`${v}.set_size(${num(w.w, 10)}, ${num(w.h, 10)})`);
  const bg = () => {
    if (w.bg) { style("bg_color", color(w.bg)); style("bg_opa", "lv.OPA.COVER"); }
  };
  const box = () => {
    if (w.border !== undefined) style("border_width", num(w.border, 0));
    if (w.borderColor) style("border_color", color(w.borderColor));
    if (w.radius !== undefined) style("radius", num(w.radius, 0));
  };
  const text = () => {
    if (w.font && w.font !== 14) style("text_font", `lv.font_montserrat_${w.font}`);
    if (w.align && w.align !== "left") style("text_align", `lv.TEXT_ALIGN.${w.align.toUpperCase()}`);
    if (w.letterSpace) style("text_letter_space", num(w.letterSpace, 0));
    if (w.lineSpace) style("text_line_space", num(w.lineSpace, 0));
  };
  const arcSize = () => {
    if (!stretch) { size(); return; }
    L(`${v}.set_size(${stretch.s}, ${stretch.s})`);
    if (stretch.sx !== 256) style("transform_scale_x", String(stretch.sx));
    if (stretch.sy !== 256) style("transform_scale_y", String(stretch.sy));
  };
  const arcShape = () => {
    if (w.startAngle !== undefined || w.endAngle !== undefined) L(`${v}.set_bg_angles(${num(w.startAngle, 135)}, ${num(w.endAngle, 45)})`);
    if (w.rotation) L(`${v}.set_rotation(${num(w.rotation, 0)})`);
    L(`${v}.remove_style(None, lv.PART.KNOB)`);
    L(`${v}.remove_flag(lv.obj.FLAG.CLICKABLE)`);
  };
  const shape = () => {
    style("pad_all", "0");
    L(`${v}.remove_flag(lv.obj.FLAG.SCROLLABLE)`);
    L(`${v}.remove_flag(lv.obj.FLAG.CLICKABLE)`);
    if (w.bg) bg(); else style("bg_opa", "lv.OPA.TRANSP");
    style("border_width", num(w.border, 0));
    if (w.borderColor) style("border_color", color(w.borderColor));
  };
  const textColor = () => { if (w.color) style("text_color", color(w.color)); };
  const focus = () => L(`group.add_obj(${v})`);
  const range = () => L(`${v}.set_range(${num(w.min, 0)}, ${num(w.max, 100)})`);
  const indicator = () => { if (w.color) style("bg_color", color(w.color), "lv.PART.INDICATOR"); };
  const onValue = (args: string) =>
    L(`${v}.add_event_cb(lambda e: _emit(${py(v)}${args ? ", " + args : ""}), lv.EVENT.VALUE_CHANGED, None)`);

  if (!crop) L(`# ${v}`);
  switch (w.kind) {
    case "label":
      L(`${v} = lv.label(${parent})`);
      pos(); size();
      L(`${v}.set_text(${py(w.text ?? "")})`);
      if (w.longMode && w.longMode !== "wrap") L(`${v}.set_long_mode(${LONG_MODES.indexOf(w.longMode)})  # ${w.longMode}`);
      textColor(); text(); bg(); box();
      break;
    case "panel":
      L(`${v} = lv.obj(${parent})`);
      pos(); size();
      style("pad_all", "0");
      L(`${v}.remove_flag(lv.obj.FLAG.SCROLLABLE)`);
      bg(); box(); textColor(); text();
      break;
    case "line": {
      const pts = linePoints(w).map(([x, y]) => `{"x": ${num(x, 0)}, "y": ${num(y, 0)}}`);
      L(`${v}_points = [${pts.join(", ")}]`);
      L(`${v} = lv.line(${parent})`);
      pos();
      L(`${v}.set_points(${v}_points, ${pts.length})`);
      style("line_width", num(w.width, 2));
      if (w.color) style("line_color", color(w.color));
      style("line_rounded", w.rounded === false ? "False" : "True");
      if (w.dashWidth && w.dashGap) { style("line_dash_width", num(w.dashWidth, 0)); style("line_dash_gap", num(w.dashGap, 0)); }
      if (w.closed && w.bg) {
        // Fill: triangles drawn under the line (lv.line has no fill).
        L(`${v}_tris = (${triangulate(linePoints(w)).join(", ")})`);
        L(`${v}.add_event_cb(lambda e: _fill_tris(e, ${v}_tris, ${color(w.bg)}), lv.EVENT.DRAW_MAIN_BEGIN, None)`);
      }
      break;
    }
    case "bar":
      L(`${v} = lv.bar(${parent})`);
      pos(); size(); range();
      if (w.barMode === "symmetrical") L(`${v}.set_mode(${BAR_MODES.indexOf(w.barMode)})  # symmetrical`);
      L(`${v}.set_value(${num(w.value, 0)}, False)`);
      indicator(); bg(); box();
      break;
    case "arc":
      L(`${v} = lv.arc(${parent})`);
      pos(); arcSize();
      arcShape();
      if (w.arcMode && w.arcMode !== "normal") L(`${v}.set_mode(${ARC_MODES.indexOf(w.arcMode)})  # ${w.arcMode}`);
      range();
      L(`${v}.set_value(${num(w.value, 0)})`);
      if (w.width !== undefined) { style("arc_width", num(w.width, 6)); style("arc_width", num(w.width, 6), "lv.PART.INDICATOR"); }
      if (w.rounded !== undefined) { style("arc_rounded", w.rounded ? "True" : "False"); style("arc_rounded", w.rounded ? "True" : "False", "lv.PART.INDICATOR"); }
      if (w.bg) style("arc_color", color(w.bg));
      if (w.color) style("arc_color", color(w.color), "lv.PART.INDICATOR");
      textColor(); text();
      break;
    case "arcline":
      // A background-only lv.arc, stretched into an ellipse with a transform.
      L(`${v} = lv.arc(${parent})`);
      pos(); arcSize();
      arcShape();
      style("arc_opa", "lv.OPA.TRANSP", "lv.PART.INDICATOR");
      style("arc_width", num(w.width, 3));
      style("arc_rounded", w.rounded === false ? "False" : "True");
      style("arc_color", color(w.color, "0xFFFFFF"));
      break;
    case "rect":
    case "ellipse":
      L(`${v} = lv.obj(${parent})`);
      pos(); size();
      shape();
      style("radius", w.kind === "ellipse" ? "lv.RADIUS_CIRCLE" : num(w.radius, 0));
      break;
    case "led":
      L(`${v} = lv.led(${parent})`);
      pos(); size();
      L(`${v}.set_color(${color(w.color, "0xFF0000")})`);
      L(w.checked === false ? `${v}.off()` : `${v}.on()`);
      break;
    case "spinner":
      L(`${v} = lv.spinner(${parent})`);
      pos(); size();
      if (w.spinTime !== undefined || w.spinArc !== undefined) L(`${v}.set_anim_params(${num(w.spinTime, 1000)}, ${num(w.spinArc, 200)})`);
      if (w.width !== undefined) { style("arc_width", num(w.width, 12)); style("arc_width", num(w.width, 12), "lv.PART.INDICATOR"); }
      if (w.bg) style("arc_color", color(w.bg));
      if (w.color) style("arc_color", color(w.color), "lv.PART.INDICATOR");
      break;
    case "image": {
      L(`${v} = lv.image(${parent})`);
      pos(); size();
      const src = w.src ?? "";
      const path = src.startsWith("/") ? py(src) : `_DIR + ${py("/" + src)}`;
      L(`${v}_dsc = None`);
      L(`try:`);
      L(`${I}with open(${path}, "rb") as _f:`);
      L(`${I}${I}_data = _f.read()`);
      L(`${I}${v}_dsc = lv.image_dsc_t({"data_size": len(_data), "data": _data})`);
      L(`${I}${v}.set_src(${v}_dsc)`);
      L(`${I}${v}.set_inner_align(11)  # stretch: fill the widget (a no-op when the PNG already has its size)`);
      L(`except OSError:`);
      L(`${I}print(${py(`scene: image not found: ${src}`)})`);
      bg(); box();
      break;
    }
    case "qrcode":
      L(`${v} = lv.qrcode(${parent})`);
      pos();
      L(`${v}.set_dark_color(${color(w.color, "0x000000")})`);
      L(`${v}.set_light_color(${color(w.bg, "0xFFFFFF")})`);
      L(`_qr[${py(v)}] = (${v}, ${num(Math.min(w.w, w.h), 64)})`);
      L(`set_qr(${py(v)}, ${py(w.text ?? "")})`);
      break;
    case "chart": {
      const values = w.values ?? [];
      L(`${v} = lv.chart(${parent})`);
      pos(); size();
      if (w.chartType === "bar") L(`${v}.set_type(lv.chart.TYPE.BAR)`);
      L(`${v}.set_point_count(${Math.max(values.length, 2)})`);
      L(`${v}.set_axis_range(lv.chart.AXIS.PRIMARY_Y, ${num(w.min, 0)}, ${num(w.max, 100)})`);
      L(`${v}_series = ${v}.add_series(${color(w.color, "0x2196F3")}, lv.chart.AXIS.PRIMARY_Y)`);
      if (values.length) L(`for _v in [${values.map((x) => num(x, 0)).join(", ")}]:\n${I}${v}.set_next_value(${v}_series, _v)`);
      bg(); box();
      break;
    }
    case "scale":
      L(`${v} = lv.scale(${parent})`);
      pos(); size(); range();
      L(`${v}.set_total_tick_count(${num(w.ticks, 11)})`);
      L(`${v}.set_major_tick_every(${num(w.majorEvery, 5)})`);
      L(`${v}.set_label_show(True)`);
      textColor(); text();
      if (w.color) { style("line_color", color(w.color)); style("line_color", color(w.color), "lv.PART.ITEMS"); style("line_color", color(w.color), "lv.PART.INDICATOR"); }
      break;
    case "table": {
      const cells = w.cells ?? [];
      const cols = Math.max(1, ...cells.map((r) => r.length));
      L(`${v} = lv.table(${parent})`);
      pos(); size();
      L(`${v}.set_row_count(${cells.length})`);
      L(`${v}.set_column_count(${cols})`);
      for (let c = 0; c < cols; c++) L(`${v}.set_column_width(${c}, ${Math.floor((w.w - 2) / cols)})`);
      style("pad_all", "2", "lv.PART.ITEMS");
      cells.forEach((row, r) => row.forEach((cell, c) => L(`${v}.set_cell_value(${r}, ${c}, ${py(cell)})`)));
      textColor(); text(); bg(); box();
      break;
    }
    case "textarea":
      L(`${v} = lv.textarea(${parent})`);
      pos(); size();
      L(`${v}.set_text(${py(w.text ?? "")})`);
      style("pad_all", "2");
      textColor(); text(); bg(); box();
      break;
    case "button":
      L(`${v} = lv.button(${parent})`);
      pos(); size();
      style("pad_all", "0");
      L(`${v}_label = lv.label(${v})`);
      L(`${v}_label.set_text(${py(w.text ?? "")})`);
      L(`${v}_label.center()`);
      if (w.color) L(`${v}_label.set_style_text_color(${color(w.color)}, 0)`);
      text(); bg(); box();
      L(`${v}.add_event_cb(lambda e: _emit(${py(v)}), lv.EVENT.CLICKED, None)`);
      focus();
      break;
    case "list":
      L(`${v} = lv.list(${parent})`);
      pos(); size();
      style("pad_all", "2");
      style("pad_row", "0");
      textColor(); text(); bg(); box();
      L(`${v}_buttons = _fill_list(${v}, ${py(v)}, ${pyList(w.items ?? [])}, ${pyList(w.icons ?? [])})`);
      break;
    case "roller":
      L(`${v} = lv.roller(${parent})`);
      pos(); size();
      L(`${v}.set_options(${py((w.items ?? []).join("\n"))}, 0)  # 0 = normal (not infinite)`);
      L(`${v}.set_selected(${num(w.value, 0)}, False)`);
      if (w.color) style("bg_color", color(w.color), "lv.PART.SELECTED");
      text(); bg(); box();
      onValue(`${v}.get_selected(), selected_text(${py(v)})`);
      focus();
      break;
    case "dropdown":
      L(`${v} = lv.dropdown(${parent})`);
      pos(); size();
      L(`${v}.set_options(${py((w.items ?? []).join("\n"))})`);
      L(`${v}.set_selected(${num(w.value, 0)})`);
      style("pad_ver", "2");
      textColor(); text(); bg(); box();
      onValue(`${v}.get_selected(), selected_text(${py(v)})`);
      focus();
      break;
    case "slider":
      L(`${v} = lv.slider(${parent})`);
      pos(); size(); range();
      if (w.barMode === "symmetrical") L(`${v}.set_mode(${BAR_MODES.indexOf(w.barMode)})  # symmetrical`);
      L(`${v}.set_value(${num(w.value, 0)}, False)`);
      if (w.color) { indicator(); style("bg_color", color(w.color), "lv.PART.KNOB"); }
      bg(); box();
      onValue(`${v}.get_value()`);
      focus();
      break;
    case "checkbox":
      L(`${v} = lv.checkbox(${parent})`);
      pos(); size();
      L(`${v}.set_text(${py(w.text ?? "")})`);
      if (w.checked) L(`${v}.add_state(lv.STATE.CHECKED)`);
      textColor(); text(); bg(); box();
      onValue(`${v}.has_state(lv.STATE.CHECKED)`);
      focus();
      break;
    case "switch":
      L(`${v} = lv.switch(${parent})`);
      pos(); size();
      if (w.checked) L(`${v}.add_state(lv.STATE.CHECKED)`);
      if (w.color) style("bg_color", color(w.color), "lv.PART.INDICATOR | lv.STATE.CHECKED");
      bg(); box();
      onValue(`${v}.has_state(lv.STATE.CHECKED)`);
      focus();
      break;
    case "scrollbox":
      L(`${v} = lv.obj(${parent})`);
      pos(); size();
      style("pad_all", "0");
      bg(); box(); textColor(); text();
      focus();
      break;
    case "tabview": {
      const tabs = w.items?.length ? w.items : ["Tab"];
      L(`${v} = lv.tabview(${parent})`);
      pos(); size();
      L(`${v}.set_tab_bar_size(${num(w.barSize, 20)})`);
      L(`${v}_tabs = [${v}.add_tab(_t) for _t in ${pyList(tabs)}]`);
      L(`for _t in ${v}_tabs:\n${I}_t.set_style_pad_all(0, 0)`);
      L(`${v}.set_active(${num(w.value, 0)}, False)`);
      textColor(); text(); bg(); box();
      L(`_bar = ${v}.get_tab_bar()`);
      L(`for _i in range(_bar.get_child_count()):\n${I}group.add_obj(_bar.get_child(_i))`);
      onValue(`${v}.get_tab_active(), selected_text(${py(v)})`);
      break;
    }
  }
  if (angle) {
    const [t, px, py_] = crop
      ? [`${v}_clip`, num(w.w / 2 - crop.x, 0), num(w.h / 2 - crop.y, 0)]
      : stretch ? [v, num(stretch.s / 2, 0), num(stretch.s / 2, 0)] : [v, "lv.pct(50)", "lv.pct(50)"];
    L(`${t}.set_style_transform_pivot_x(${px}, 0)`);
    L(`${t}.set_style_transform_pivot_y(${py_}, 0)`);
    L(`${t}.set_style_transform_rotation(${angle * 10}, 0)  # ${angle}°`);
  }
  if (w.opacity !== undefined && w.opacity < 100) style("opa", String(Math.round((Math.max(0, w.opacity) * 255) / 100)));
  if (w.hidden) L(`${v}.add_flag(lv.obj.FLAG.HIDDEN)`);
  return out;
}

/** The scene's Python module (file body below the header line). */
export function sceneToPython(doc: SceneDoc, moduleName: string): string {
  const widgets = creationOrder(doc);
  const lists = widgets.filter((w) => w.kind === "list");
  const choosers = widgets.filter((w) => w.kind === "list" || w.kind === "roller" || w.kind === "dropdown" || w.kind === "tabview");
  const hasImage = widgets.some((w) => w.kind === "image");
  const example = widgets[0]?.kind === "label" ? `${moduleName}.${widgets[0].name}.set_text("Hi")` : `${moduleName}.hide()`;

  const parts: string[] = [];
  parts.push([
    `# Scene "${moduleName}", generated by the scene editor.`,
    `# Do not edit this file by hand: changes are overwritten. Use it from code:`,
    `#     import ${moduleName}`,
    `#     ${moduleName}.show()`,
    `#     ${example}`,
    `import lvgl as lv`,
  ].join("\n"));

  const setup = [
    `root = lv.obj(lv.screen_active())`,
    `root.set_pos(0, 0)`,
    `root.set_size(${SCREEN_W}, ${SCREEN_H})`,
    `root.set_style_bg_color(${color(doc.bg, "0x000000")}, 0)`,
    `root.set_style_bg_opa(lv.OPA.COVER, 0)`,
    `root.set_style_border_width(0, 0)`,
    `root.set_style_radius(0, 0)`,
    `root.set_style_pad_all(0, 0)`,
    `root.remove_flag(lv.obj.FLAG.SCROLLABLE)`,
    `root.add_flag(lv.obj.FLAG.HIDDEN)`,
    `group = lv.group_create()`,
    `_handlers = {}`,
    `_last = {}`,
  ];
  if (widgets.some((w) => w.kind === "qrcode")) setup.push(`_qr = {}`);
  if (hasImage) setup.push(`_DIR = __file__.rsplit("/", 1)[0] if "/" in __file__ else "."`);
  parts.push(setup.join("\n"));

  parts.push([
    `def _emit(name, *args):`,
    `${I}cb = _handlers.get(name)`,
    `${I}if cb:`,
    `${I}${I}cb(*args)`,
  ].join("\n"));

  if (widgets.some((w) => w.kind === "line" && w.closed && w.bg)) {
    parts.push([
      `def _fill_tris(e, tris, color):`,
      `${I}"""Fill a closed line: draw its triangles (x1, y1, x2, y2, x3, y3, …) inside the object."""`,
      `${I}a = lv.area_t()`,
      `${I}e.get_target_obj().get_coords(a)`,
      `${I}d = lv.draw_triangle_dsc_t()`,
      `${I}d.init()`,
      `${I}d.color = color`,
      `${I}d.opa = lv.OPA.COVER`,
      `${I}layer = e.get_layer()`,
      `${I}for i in range(0, len(tris), 6):`,
      `${I}${I}d.p[0] = {"x": a.x1 + tris[i], "y": a.y1 + tris[i + 1]}`,
      `${I}${I}d.p[1] = {"x": a.x1 + tris[i + 2], "y": a.y1 + tris[i + 3]}`,
      `${I}${I}d.p[2] = {"x": a.x1 + tris[i + 4], "y": a.y1 + tris[i + 5]}`,
      `${I}${I}lv.draw_triangle(layer, d)`,
    ].join("\n"));
  }

  if (widgets.some((w) => w.kind === "qrcode")) {
    parts.push([
      `# Byte capacity of QR versions 1..40 (error correction M, as LVGL encodes).`,
      `_QR_CAP = (${QR_CAPACITY_M.join(", ")})`,
      ``,
      ``,
      `def set_qr(name, text):`,
      `${I}"""Show \`text\` in QR code widget \`name\`."""`,
      `${I}qr, box = _qr[name]`,
      `${I}data = str(text).encode()`,
      `${I}# Size the widget to exactly modules * scale: LVGL leaves the rest of`,
      `${I}# the box as a light row / column on the right and bottom.`,
      `${I}v = 1`,
      `${I}while v < 40 and _QR_CAP[v - 1] < len(data):`,
      `${I}${I}v += 1`,
      `${I}scale = max(1, box // (17 + 4 * v))`,
      `${I}while v < 40 and (21 + 4 * v) * scale <= box:`,
      `${I}${I}v += 1`,
      `${I}qr.set_size((17 + 4 * v) * scale)`,
      `${I}qr.update(data, len(data))`,
    ].join("\n"));
  } else {
    parts.push([
      `def set_qr(name, text):`,
      `${I}"""Show \`text\` in a QR code widget (this scene has none)."""`,
      `${I}raise ValueError("no QR code named " + name)`,
    ].join("\n"));
  }

  if (lists.length) {
    parts.push([
      `def _pick(name, index, text):`,
      `${I}_last[name] = index`,
      `${I}_emit(name, index, text)`,
      ``,
      ``,
      `def _fill_list(lst, name, items, icons=()):`,
      `${I}lst.clean()`,
      `${I}_items[name] = list(items)`,
      `${I}buttons = []`,
      `${I}for i, text in enumerate(items):`,
      `${I}${I}icon = getattr(lv.SYMBOL, icons[i]) if i < len(icons) and icons[i] else None`,
      `${I}${I}b = lst.add_button(icon, text)`,
      `${I}${I}b.set_style_pad_ver(4, 0)`,
      `${I}${I}b.set_style_pad_hor(6, 0)`,
      `${I}${I}b.add_flag(lv.obj.FLAG.SCROLL_ON_FOCUS)`,
      `${I}${I}b.add_event_cb(lambda e, i=i, t=text: _pick(name, i, t), lv.EVENT.CLICKED, None)`,
      `${I}${I}group.add_obj(b)`,
      `${I}${I}buttons.append(b)`,
      `${I}return buttons`,
    ].join("\n"));
  }

  // _items must exist before _fill_list runs.
  const items = choosers
    .filter((w) => w.kind === "list" || w.kind === "tabview")
    .map((w) => `${py(w.name)}: ${pyList(w.kind === "tabview" && !w.items?.length ? ["Tab"] : w.items ?? [])}`);
  parts.push(`_items = {${items.join(", ")}}`);

  for (const w of widgets) parts.push(widgetLines(doc, w).join("\n"));

  parts.push(`_choosers = {${choosers.map((w) => `${py(w.name)}: (${w.name}, ${py(w.kind)})`).join(", ")}}`);

  const listGlobals = lists.map((w) => `${w.name}_buttons`);
  const setItems: string[] = [
    `def set_items(name, items):`,
    `${I}"""Replace the options of a menu list, roller or dropdown."""`,
  ];
  if (listGlobals.length) setItems.push(`${I}global ${listGlobals.join(", ")}`);
  let first = true;
  for (const w of choosers) {
    if (w.kind === "tabview") continue;
    setItems.push(`${I}${first ? "if" : "elif"} name == ${py(w.name)}:`);
    first = false;
    if (w.kind === "list") setItems.push(`${I}${I}${w.name}_buttons = _fill_list(${w.name}, ${py(w.name)}, items)`);
    else if (w.kind === "roller") setItems.push(`${I}${I}${w.name}.set_options("\\n".join(items), 0)`);
    else setItems.push(`${I}${I}${w.name}.set_options("\\n".join(items))`);
  }
  setItems.push(first
    ? `${I}raise ValueError("no menu list, roller or dropdown named " + name)`
    : `${I}else:\n${I}${I}raise ValueError("no menu list, roller or dropdown named " + name)`);

  parts.push([
    `def on(name, cb):`,
    `${I}"""Call cb when widget \`name\` is used with the hub buttons.`,
    ``,
    `${I}button: cb()   menu list / roller / dropdown / tabs: cb(index, text)`,
    `${I}slider: cb(value)   checkbox / switch: cb(checked)`,
    `${I}Callbacks run inside lv.timer_handler(), so keep calling it.`,
    `${I}"""`,
    `${I}_handlers[name] = cb`,
    ``,
    ``,
    `def show():`,
    `${I}"""Show this scene (hiding everything else on the screen) and give it the button focus."""`,
    `${I}scr = lv.screen_active()`,
    `${I}for i in range(scr.get_child_count()):`,
    `${I}${I}scr.get_child(i).add_flag(lv.obj.FLAG.HIDDEN)`,
    `${I}root.remove_flag(lv.obj.FLAG.HIDDEN)`,
    `${I}group.set_default()`,
    `${I}if group.get_focused() is None:`,
    `${I}${I}group.focus_next()  # widgets added while root was hidden have no focus yet`,
    ``,
    ``,
    `def hide():`,
    `${I}"""Hide this scene."""`,
    `${I}root.add_flag(lv.obj.FLAG.HIDDEN)`,
    ``,
    ``,
    `def is_shown():`,
    `${I}"""True while this scene is visible."""`,
    `${I}return not root.has_flag(lv.obj.FLAG.HIDDEN)`,
    ``,
    ``,
    ...setItems,
    ``,
    ``,
    `def selected_index(name):`,
    `${I}"""Selected item of a menu list (last picked), roller, dropdown or tabs; -1 = none."""`,
    `${I}w, kind = _choosers[name]`,
    `${I}if kind == "list":`,
    `${I}${I}return _last.get(name, -1)`,
    `${I}if kind == "tabview":`,
    `${I}${I}return w.get_tab_active()`,
    `${I}return w.get_selected()`,
    ``,
    ``,
    `def selected_text(name):`,
    `${I}"""Text of the selected item (see selected_index); "" = none."""`,
    `${I}w, kind = _choosers[name]`,
    `${I}items = _items[name] if kind in ("list", "tabview") else w.get_options().split("\\n")`,
    `${I}i = selected_index(name)`,
    `${I}return items[i] if 0 <= i < len(items) else ""`,
  ].join("\n"));

  return parts.join("\n\n\n") + "\n";
}

/** Width of the content area of a container (for the editor). */
export function contentSize(w: SceneWidget): { w: number; h: number } {
  const off = contentOffset(w);
  return { w: w.w - off.x, h: w.h - off.y };
}
