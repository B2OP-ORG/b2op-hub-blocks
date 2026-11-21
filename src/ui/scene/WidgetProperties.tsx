import {
  CHECK_KINDS, FONT_SIZES, ITEM_KINDS, KIND_LABEL, LONG_MODES, TEXT_KINDS, isContainer, nameProblem,
  type FontSize, type LongMode, type SceneDoc, type SceneKind, type SceneWidget, type TextAlign,
} from "../../scene/model";
import { clampedPos, drawnSize, isOutside } from "../../scene/geometry";
import { usePalette } from "../theme";
import { Button } from "../components/Button";
import { CheckField } from "../components/CheckField";
import { ColorField } from "../components/ColorField";
import { FieldRow } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { CodeUsage, DeleteButton, PropertyPanel } from "../components/PropertyPanel";
import { SelectField } from "../components/SelectField";
import { TextAreaField } from "../components/TextAreaField";
import { TextField } from "../components/TextField";
import { ItemsField } from "./ItemsField";
import { usageFor } from "./usage";

/** Inspector for the selected scene widget. */
export function WidgetProperties({ doc, w, module, selPath, onChange, onDelete }: {
  doc: SceneDoc;
  w: SceneWidget;
  module: string;
  /** The selection and everything inside it (can't become its own parent). */
  selPath: Set<string>;
  onChange: (patch: Partial<SceneWidget>) => void;
  onDelete: () => void;
}) {
  const p = usePalette();
  const k = w.kind;
  const containers = doc.widgets.filter((o) => isContainer(o.kind) && !selPath.has(o.uid));
  const parent = doc.widgets.find((o) => o.uid === w.parent);
  const has = (...kinds: SceneKind[]) => kinds.includes(k);
  const colorLabel = has("line") ? "Line colour" : has("led") ? "LED colour" : has("qrcode") ? "Dark colour" : has("bar", "slider", "arc", "spinner", "chart") ? "Indicator colour"
    : has("roller") ? "Selection colour" : has("switch") ? "On colour" : has("tabview") ? "Active tab colour" : "Text colour";
  const textish = has("label", "button", "checkbox", "textarea", "list", "roller", "dropdown", "table", "tabview", "panel", "scrollbox", "scale", "arc");

  return (
    <PropertyPanel width={260} title={KIND_LABEL[k]}>
      <TextField label="Name (Python variable)" value={w.name} validate={(v) => nameProblem(v.trim(), doc, w.uid, k)} onCommit={(v) => onChange({ name: v.trim() })} />
      <FieldRow>
        <NumberField label="X" value={w.x} int onCommit={(v) => onChange({ x: v })} />
        <NumberField label="Y" value={w.y} int onCommit={(v) => onChange({ y: v })} />
      </FieldRow>
      {k === "qrcode"
        ? <NumberField label={`Max size (drawn ${drawnSize(w).w} px)`} value={Math.min(w.w, w.h)} min={8} int onCommit={(v) => onChange({ w: v, h: v })} />
        : k !== "line" && (
          <FieldRow>
            <NumberField label="Width" value={w.w} min={1} int onCommit={(v) => onChange({ w: v })} />
            <NumberField label="Height" value={w.h} min={1} int onCommit={(v) => onChange({ h: v })} />
          </FieldRow>
        )}
      <SelectField grow label="Inside" value={w.parent ?? ""} options={[["", "Screen"], ...containers.map((c): [string, string] => [c.uid, `${c.name} (${KIND_LABEL[c.kind]})`])]}
        onChange={(v) => onChange({ parent: v || undefined, tab: doc.widgets.find((o) => o.uid === v)?.kind === "tabview" ? 0 : undefined, x: 0, y: 0 })} />
      {parent?.kind === "tabview" && (
        <SelectField grow label="Tab" value={String(w.tab ?? 0)} options={(parent.items ?? ["Tab"]).map((t, i): [string, string] => [String(i), t])} onChange={(v) => onChange({ tab: Number(v) })} />
      )}
      {isOutside(doc, w) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: p.danger, fontSize: 12 }}>
          <span style={{ flex: 1 }}>Outside {parent ? parent.name : "the screen"}: it won't be visible.</span>
          <Button onClick={() => onChange(clampedPos(doc, w))}>Move into view</Button>
        </div>
      )}
      <CheckField label="Hidden at start (show from code)" value={!!w.hidden} onChange={(v) => onChange({ hidden: v || undefined })} />

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
      {has("bar", "slider", "arc", "scale", "chart") && (
        <FieldRow>
          <NumberField label="Min" value={w.min ?? 0} int onCommit={(v) => onChange({ min: v })} />
          <NumberField label="Max" value={w.max ?? 100} int onCommit={(v) => onChange({ max: v })} />
          {has("bar", "slider", "arc") && <NumberField label="Value" value={w.value ?? 0} int onCommit={(v) => onChange({ value: v })} />}
        </FieldRow>
      )}
      {has(...CHECK_KINDS) && <CheckField label={k === "led" ? "On" : "Checked"} value={!!(k === "led" ? w.checked !== false : w.checked)} onChange={(v) => onChange({ checked: v })} />}
      {k === "line" && (
        <TextAreaField label="Points (x, y per line, relative)" value={(w.points ?? []).map(([x, y]) => `${x}, ${y}`).join("\n")}
          onCommit={(v) => onChange({ points: v.split("\n").map((l) => l.split(/[,\s]+/).map(Number)).filter((a) => a.length >= 2 && a.every(Number.isFinite)).map((a) => [Math.round(a[0]), Math.round(a[1])] as [number, number]) })} />
      )}
      {has("line", "arc") && <NumberField label={k === "arc" ? "Arc width" : "Line width"} value={w.width ?? (k === "arc" ? 6 : 2)} min={1} int onCommit={(v) => onChange({ width: v })} />}
      {k === "image" && <TextField label="PNG file (relative to this file, or /sd/…)" value={w.src ?? ""} onCommit={(v) => onChange({ src: v.trim() })} />}
      {k === "chart" && (
        <>
          <SelectField grow label="Type" value={w.chartType ?? "line"} options={[["line", "Line"], ["bar", "Bars"]]} onChange={(v) => onChange({ chartType: v as "line" | "bar" })} />
          <TextField label="Start values (comma separated)" value={(w.values ?? []).join(", ")}
            onCommit={(v) => onChange({ values: v.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite).map(Math.round) })} />
        </>
      )}
      {k === "scale" && (
        <FieldRow>
          <NumberField label="Ticks" value={w.ticks ?? 11} min={2} int onCommit={(v) => onChange({ ticks: v })} />
          <NumberField label="Number every" value={w.majorEvery ?? 5} min={1} int onCommit={(v) => onChange({ majorEvery: v })} />
        </FieldRow>
      )}
      {k === "table" && (
        <TextAreaField label="Cells (one row per line, cells split by |)" value={(w.cells ?? []).map((r) => r.join(" | ")).join("\n")}
          onCommit={(v) => onChange({ cells: v.split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((c) => c.trim())) })} />
      )}
      {k === "tabview" && <NumberField label="Tab bar height" value={w.barSize ?? 20} min={8} int onCommit={(v) => onChange({ barSize: v })} />}

      {k !== "image" && <ColorField label={colorLabel} value={w.color} onChange={(v) => onChange({ color: v })} />}
      {!has("line", "led", "spinner", "switch", "checkbox") && <ColorField label={k === "qrcode" ? "Light colour" : "Background"} value={w.bg} onChange={(v) => onChange({ bg: v })} />}
      {!has("line", "led", "spinner", "qrcode", "arc", "scale", "switch", "checkbox") && (
        <>
          <FieldRow>
            <NumberField label="Border" value={w.border ?? 0} min={0} int onCommit={(v) => onChange({ border: v })} />
            <NumberField label="Corner radius" value={w.radius ?? 0} min={0} int onCommit={(v) => onChange({ radius: v })} />
          </FieldRow>
          {(w.border ?? 0) > 0 && <ColorField label="Border colour" value={w.borderColor} onChange={(v) => onChange({ borderColor: v })} />}
        </>
      )}
      {textish && (
        <FieldRow>
          <SelectField grow label="Font size" value={String(w.font ?? 14)} options={FONT_SIZES.map((s): [string, string] => [String(s), `${s}`])} onChange={(v) => onChange({ font: Number(v) === 14 ? undefined : Number(v) as FontSize })} />
          {has("label", "textarea", "table") && (
            <SelectField grow label="Align" value={w.align ?? "left"} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(v) => onChange({ align: v === "left" ? undefined : v as TextAlign })} />
          )}
        </FieldRow>
      )}

      <CodeUsage code={usageFor(w, module)} />
      <DeleteButton onClick={onDelete} label={`Delete${isContainer(k) && doc.widgets.some((o) => o.parent === w.uid) ? " (with contents)" : ""}`} />
    </PropertyPanel>
  );
}
