import {
  ARC_MODES, CHECK_KINDS, FONT_SIZES, ITEM_KINDS, KIND_LABEL, LONG_MODES, TEXT_KINDS, isContainer, nameProblem,
  type ArcMode, type FontSize, type LongMode, type SceneDoc, type SceneKind, type SceneWidget, type TextAlign,
} from "../../scene/model";
import { LV_ARC_WIDTH, sweepOf, clampedPos, drawnSize, effectiveCrop, isOutside, normalizeLine } from "../../scene/geometry";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { CheckField } from "../components/CheckField";
import { ColorField } from "../components/ColorField";
import { FieldRow } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { CodeUsage, DeleteButton, PropertyPanel } from "../components/PropertyPanel";
import { PropertyGroup } from "../components/PropertyGroup";
import panelStyles from "../components/PropertyPanel.module.css";
import { SelectField } from "../components/SelectField";
import { TextAreaField } from "../components/TextAreaField";
import { TextField } from "../components/TextField";
import type { FoldState } from "../hooks/useFoldState";
import { AngleDial } from "./AngleDial";
import { ARC_PRESETS } from "./constants";
import { ImageField } from "./ImageField";
import { ItemsField } from "./ItemsField";
import { usageFor } from "./usage";

/** Inspector for the selected scene widget. */
export function WidgetProperties({ doc, w, module, scenePath, selPath, folds, onChange, onDelete }: {
  doc: SceneDoc;
  w: SceneWidget;
  module: string;
  /** Project path of the scene file (images are resolved next to it). */
  scenePath: string;
  /** The selection and everything inside it (can't become its own parent). */
  selPath: Set<string>;
  folds: FoldState;
  onChange: (patch: Partial<SceneWidget>) => void;
  onDelete: () => void;
}) {
  const p = usePalette();
  const k = w.kind;
  const containers = doc.widgets.filter((o) => isContainer(o.kind) && !selPath.has(o.uid));
  const parent = doc.widgets.find((o) => o.uid === w.parent);
  const has = (...kinds: SceneKind[]) => kinds.includes(k);
  const colorLabel = has("line", "arcline") ? "Line colour" : has("led") ? "LED colour" : has("qrcode") ? "Dark colour" : has("bar", "slider", "arc", "spinner", "chart") ? "Indicator colour"
    : has("roller") ? "Selection colour" : has("switch") ? "On colour" : has("tabview") ? "Active tab colour" : "Text colour";
  const bgLabel = has("qrcode") ? "Light colour" : has("arc", "spinner") ? "Track colour" : has("rect", "ellipse") ? "Fill" : "Background";
  const textish = has("label", "button", "checkbox", "textarea", "list", "roller", "dropdown", "table", "tabview", "panel", "scrollbox", "scale", "arc");
  const lockAspect = k === "image" && w.keepAspect !== false && w.w > 0 && w.h > 0;
  const boxed = !has("line", "led", "spinner", "qrcode", "arc", "arcline", "scale", "switch", "checkbox");
  const group = (id: string, title: string, children: React.ReactNode) => (
    <PropertyGroup title={title} folded={folds.isFolded(id)} onToggle={() => folds.toggle(id)}>{children}</PropertyGroup>
  );
  const num = (label: string, value: number, patch: (v: number) => Partial<SceneWidget>, min?: number, max?: number) => (
    <NumberField label={label} value={value} min={min} max={max} int onCommit={(v) => onChange(patch(v))} />
  );

  return (
    <PropertyPanel title={KIND_LABEL[k]}>
      {group("general", "General", <>
        <TextField label="Name (Python variable)" value={w.name} validate={(v) => nameProblem(v.trim(), doc, w.uid, k)} onCommit={(v) => onChange({ name: v.trim() })} />
        <SelectField grow label="Inside" value={w.parent ?? ""} options={[["", "Screen"], ...containers.map((c): [string, string] => [c.uid, `${c.name} (${KIND_LABEL[c.kind]})`])]}
          onChange={(v) => onChange({ parent: v || undefined, tab: doc.widgets.find((o) => o.uid === v)?.kind === "tabview" ? 0 : undefined, x: 0, y: 0 })} />
        {parent?.kind === "tabview" && (
          <SelectField grow label="Tab" value={String(w.tab ?? 0)} options={(parent.items ?? ["Tab"]).map((t, i): [string, string] => [String(i), t])} onChange={(v) => onChange({ tab: Number(v) })} />
        )}
        <CheckField label="Hidden at start (show from code)" value={!!w.hidden} onChange={(v) => onChange({ hidden: v || undefined })} />
      </>)}

      {group("layout", "Position & size", <>
        <FieldRow>
          {num("X", w.x, (x) => ({ x }))}
          {num("Y", w.y, (y) => ({ y }))}
        </FieldRow>
        {k === "qrcode"
          ? num(`Max size (drawn ${drawnSize(w).w} px)`, Math.min(w.w, w.h), (v) => ({ w: v, h: v }), 8)
          : k !== "line" && (
            <FieldRow>
              {num("Width", w.w, (v) => (lockAspect ? { w: v, h: Math.max(1, Math.round((v * w.h) / w.w)) } : { w: v }), 1)}
              {num("Height", w.h, (v) => (lockAspect ? { h: v, w: Math.max(1, Math.round((v * w.w) / w.h)) } : { h: v }), 1)}
            </FieldRow>
          )}
        {isOutside(doc, w) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: p.danger, fontSize: 12 }}>
            <span style={{ flex: 1 }}>Outside {parent ? parent.name : "the screen"}: it won't be visible.</span>
            <Button onClick={() => onChange(clampedPos(doc, w))}>Move into view</Button>
          </div>
        )}
      </>)}

      {group("content", k === "image" ? "Image" : "Content", <>
        {has(...TEXT_KINDS) && (has("label", "textarea")
          ? <TextAreaField label="Text" value={w.text ?? ""} onCommit={(v) => onChange({ text: v })} />
          : <TextField label={k === "qrcode" ? "Data (text / URL)" : "Text"} value={w.text ?? ""} onCommit={(v) => onChange({ text: v })} />)}
        {k === "label" && (
          <SelectField grow label="Long text" value={w.longMode ?? "wrap"} options={LONG_MODES.map((m): [string, string] => [m, { wrap: "Wrap lines", dots: "Cut with …", scroll: "Scroll back and forth", circular: "Scroll round", clip: "Cut off" }[m]])}
            onChange={(v) => onChange({ longMode: v === "wrap" ? undefined : v as LongMode })} />
        )}
        {has(...ITEM_KINDS, "tabview") && (
          <ItemsField label={k === "tabview" ? "Tabs" : "Items"} items={w.items ?? []} icons={k === "list" ? w.icons ?? [] : undefined}
            onChange={(items, icons) => onChange({ items, ...(k === "list" ? { icons } : {}), value: Math.min(w.value ?? 0, Math.max(0, items.length - 1)) })} />
        )}
        {has("roller", "dropdown", "tabview") && (
          <SelectField grow label={k === "tabview" ? "Active tab" : "Selected"} value={String(w.value ?? 0)}
            options={(w.items?.length ? w.items : ["Tab"]).map((t, i): [string, string] => [String(i), t])} onChange={(v) => onChange({ value: Number(v) })} />
        )}
        {k === "tabview" && num("Tab bar height", w.barSize ?? 20, (barSize) => ({ barSize }), 8)}
        {k === "image" && <ImageField w={w} scenePath={scenePath} onChange={onChange} />}
        {k === "chart" && (
          <>
            <SelectField grow label="Type" value={w.chartType ?? "line"} options={[["line", "Line"], ["bar", "Bars"]]} onChange={(v) => onChange({ chartType: v as "line" | "bar" })} />
            <TextField label="Start values (comma separated)" value={(w.values ?? []).join(", ")}
              onCommit={(v) => onChange({ values: v.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite).map(Math.round) })} />
          </>
        )}
        {k === "table" && (
          <TextAreaField label="Cells (one row per line, cells split by |)" value={(w.cells ?? []).map((r) => r.join(" | ")).join("\n")}
            onCommit={(v) => onChange({ cells: v.split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((c) => c.trim())) })} />
        )}
      </>)}

      {group("value", "Value", <>
        {has("bar", "slider", "arc", "scale", "chart") && (
          <FieldRow>
            {num("Min", w.min ?? 0, (min) => ({ min }))}
            {num("Max", w.max ?? 100, (max) => ({ max }))}
            {has("bar", "slider", "arc") && num("Value", w.value ?? 0, (value) => ({ value }))}
          </FieldRow>
        )}
        {has("bar", "slider") && (
          <SelectField grow label="Fill" value={w.barMode ?? "normal"} options={[["normal", "From min"], ["symmetrical", "From 0 (symmetrical)"]]}
            onChange={(v) => onChange({ barMode: v === "normal" ? undefined : "symmetrical" })} />
        )}
        {k === "arc" && (
          <SelectField grow label="Fill" value={w.arcMode ?? "normal"} options={ARC_MODES.map((m): [string, string] => [m, { normal: "From start", symmetrical: "From middle", reverse: "From end" }[m]])}
            onChange={(v) => onChange({ arcMode: v === "normal" ? undefined : v as ArcMode })} />
        )}
        {has(...CHECK_KINDS) && <CheckField label={k === "led" ? "On" : "Checked"} value={!!(k === "led" ? w.checked !== false : w.checked)} onChange={(v) => onChange({ checked: v })} />}
        {k === "scale" && (
          <FieldRow>
            {num("Ticks", w.ticks ?? 11, (ticks) => ({ ticks }), 2)}
            {num("Number every", w.majorEvery ?? 5, (majorEvery) => ({ majorEvery }), 1)}
          </FieldRow>
        )}
      </>)}

      {has("arc", "arcline") && group("arc", "Arc", <>
        {(() => {
          const start = w.startAngle ?? (k === "arc" ? 135 : 180), end = w.endAngle ?? (k === "arc" ? 45 : 0), rot = w.rotation ?? 0;
          const preset = rot === 0 ? ARC_PRESETS.find((q) => q.start === start && q.end === end)?.id ?? "custom" : "custom";
          const span = sweepOf(start, end);
          return (
            <>
              <SelectField grow label="Shape" value={preset}
                options={[...ARC_PRESETS.map((q): [string, string] => [q.id, q.label]), ["custom", "Custom"]]}
                onChange={(id) => { const q = ARC_PRESETS.find((x) => x.id === id); if (q) onChange({ startAngle: q.start, endAngle: q.end, rotation: undefined }); }} />
              <AngleDial start={start} end={end} rotation={rot} onChange={onChange} />
              <FieldRow>
                {num("Start (°)", start, (startAngle) => ({ startAngle }), 0, 360)}
                {num("Length (°)", span, (len) => (len >= 360
                  // A full circle must be 0 → 360 in LVGL: keep the start via the rotation.
                  ? { startAngle: 0, endAngle: 360, rotation: (rot + start) % 360 || undefined }
                  : { endAngle: (start + Math.max(1, len)) % 360 }), 1, 360)}
              </FieldRow>
              <FieldRow>
                {num("End (°)", end, (endAngle) => ({ endAngle }), 0, 360)}
                {num("Rotation (°)", rot, (rotation) => ({ rotation: rotation || undefined }), 0, 359)}
              </FieldRow>
              {num(k === "arc" ? "Arc width" : "Line width", w.width ?? (k === "arc" ? LV_ARC_WIDTH : 3), (width) => ({ width }), 1)}
              <div className={panelStyles.hint}>0° = right, clockwise. Drag the dial's dots (Shift: 1° steps).</div>
            </>
          );
        })()}
        {k === "arc" && (
          <CheckField label="Stretch to the box (ellipse)" value={!!w.stretch} onChange={(v) => onChange({ stretch: v || undefined })} />
        )}
        {k === "arc" && !w.stretch && w.w !== w.h && <div className={panelStyles.hint}>Not stretched, the hub draws a circle in the box's top-left corner.</div>}
        <CheckField label="Round ends" value={w.rounded !== false} onChange={(v) => onChange({ rounded: v ? undefined : false })} />
        <CheckField label="Crop (show only part of it)" value={!!w.crop}
          onChange={(v) => onChange({ crop: v ? { x: 0, y: 0, w: w.w, h: Math.max(1, Math.round(w.h / 2)) } : undefined })} />
        {w.crop && (() => {
          const c = effectiveCrop(w) ?? { x: 0, y: 0, w: w.w, h: w.h };
          const set = (patch: Partial<typeof c>): Partial<SceneWidget> => ({ crop: { ...c, ...patch } });
          return (
            <>
              <FieldRow>
                {num("Crop X", c.x, (x) => set({ x }), 0, w.w - 1)}
                {num("Crop Y", c.y, (y) => set({ y }), 0, w.h - 1)}
              </FieldRow>
              <FieldRow>
                {num("Crop width", c.w, (cw) => set({ w: cw }), 1, w.w)}
                {num("Crop height", c.h, (ch) => set({ h: ch }), 1, w.h)}
              </FieldRow>
              <div className={panelStyles.hint}>Or drag the crop frame's edges on the screen.</div>
            </>
          );
        })()}
      </>)}

      {k === "spinner" && group("spinner", "Spinner", <>
        <FieldRow>
          {num("Turn time (ms)", w.spinTime ?? 1000, (spinTime) => ({ spinTime }), 100)}
          {num("Arc length (°)", w.spinArc ?? 200, (spinArc) => ({ spinArc }), 1, 359)}
        </FieldRow>
        {num("Arc width", w.width ?? LV_ARC_WIDTH, (width) => ({ width }), 1)}
      </>)}

      {k === "line" && group("line", "Line", <>
        {num("Line width", w.width ?? 2, (width) => ({ width }), 1)}
        {(w.points ?? []).length >= 3 && (w.closed
          ? <Button onClick={() => onChange({ closed: undefined })} style={{ alignSelf: "flex-start" }}>Open the loop</Button>
          : <Button onClick={() => onChange({ closed: true })} style={{ alignSelf: "flex-start" }}>Close the loop</Button>)}
        {w.closed
          ? <CheckField label="Fill" value={!!w.bg} onChange={(v) => onChange({ bg: v ? w.bg ?? "#2196f3" : undefined })} />
          : <div className={panelStyles.hint}>Close the loop to fill it.</div>}
        {w.closed && w.bg && <ColorField label="Fill colour" value={w.bg} onChange={(v) => onChange({ bg: v })} />}
        <CheckField label="Round ends" value={w.rounded !== false} onChange={(v) => onChange({ rounded: v ? undefined : false })} />
        <FieldRow>
          {num("Dash", w.dashWidth ?? 0, (dashWidth) => ({ dashWidth: dashWidth || undefined }), 0)}
          {num("Gap", w.dashGap ?? 0, (dashGap) => ({ dashGap: dashGap || undefined }), 0)}
        </FieldRow>
        <div className={panelStyles.hint}>The hub dashes only horizontal and vertical segments.</div>
      </>)}

      {group("appearance", "Appearance", <>
        {k !== "image" && <ColorField label={colorLabel} value={w.color} onChange={(v) => onChange({ color: v })} />}
        {has("rect", "ellipse") && <CheckField label="Fill" value={!!w.bg} onChange={(v) => onChange({ bg: v ? w.bg ?? "#2196f3" : undefined })} />}
        {!has("line", "led", "switch", "checkbox", "arcline") && !(has("rect", "ellipse") && !w.bg) && <ColorField label={bgLabel} value={w.bg} onChange={(v) => onChange({ bg: v })} />}
        {boxed && (
          <>
            <FieldRow>
              {num("Border", w.border ?? 0, (border) => ({ border }), 0)}
              {k !== "ellipse" && num("Corner radius", w.radius ?? 0, (radius) => ({ radius }), 0)}
            </FieldRow>
            {(w.border ?? 0) > 0 && <ColorField label="Border colour" value={w.borderColor} onChange={(v) => onChange({ borderColor: v })} />}
          </>
        )}
        {num("Opacity (%)", w.opacity ?? 100, (o) => ({ opacity: o >= 100 ? undefined : o }), 0, 100)}
      </>)}

      {textish && group("text", "Text style", <>
        <FieldRow>
          <SelectField grow label="Font size" value={String(w.font ?? 14)} options={FONT_SIZES.map((s): [string, string] => [String(s), `${s}`])} onChange={(v) => onChange({ font: Number(v) === 14 ? undefined : Number(v) as FontSize })} />
          {has("label", "textarea", "table") && (
            <SelectField grow label="Align" value={w.align ?? "left"} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(v) => onChange({ align: v === "left" ? undefined : v as TextAlign })} />
          )}
        </FieldRow>
        <FieldRow>
          {num("Letter spacing", w.letterSpace ?? 0, (v) => ({ letterSpace: v || undefined }))}
          {num("Line spacing", w.lineSpace ?? 0, (v) => ({ lineSpace: v || undefined }))}
        </FieldRow>
      </>)}

      {k === "line" && group("points", `Points (${(w.points ?? []).length})`, <>
        <div className={panelStyles.hint}>Drag the points on the screen. Drag a small mid-point to add one, double-click a point to remove it.</div>
        <TextAreaField label="x, y per line (relative)" value={(w.points ?? []).map(([x, y]) => `${x}, ${y}`).join("\n")}
          onCommit={(v) => {
            const points = v.split("\n").map((l) => l.split(/[,\s]+/).map(Number)).filter((a) => a.length >= 2 && a.every(Number.isFinite)).map((a) => [Math.round(a[0]), Math.round(a[1])] as [number, number]);
            if (points.length >= 2) onChange(normalizeLine({ x: w.x, y: w.y, points }));
          }} />
      </>)}

      <CodeUsage code={usageFor(w, module)} />
      <DeleteButton onClick={onDelete} label={`Delete${isContainer(k) && doc.widgets.some((o) => o.parent === w.uid) ? " (with contents)" : ""}`} />
    </PropertyPanel>
  );
}
