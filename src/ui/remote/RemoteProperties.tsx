import { KIND_LABEL, isAttrName, joystickNames, nameProblem, roleOf, widgetSymbols, type RemoteSymbol, type ValueType, type Widget } from "../../remote/layout";
import { CheckField } from "../components/CheckField";
import { ColorField } from "../components/ColorField";
import { FieldRow } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { CodeUsage, DeleteButton, PropertyNote, PropertyPanel } from "../components/PropertyPanel";
import { PropertyGroup } from "../components/PropertyGroup";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import type { FoldState } from "../hooks/useFoldState";
import { MIN_H, MIN_W } from "./bounds";

/** Inspector for the selected remote widget (same grouped layout as the scene editor's). */
export function RemoteProperties({ w, fileName, others, folds, onChange, onDelete }: {
  w: Widget;
  fileName: string;
  /** Symbols of the other widgets with the same role (whole project). */
  others: RemoteSymbol[];
  /** Folded groups (remembered per user). */
  folds: FoldState;
  onChange: (patch: Partial<Widget>) => void;
  onDelete: () => void;
}) {
  const role = roleOf(w.kind);
  const otherNames = new Set(others.map((s) => s.name));
  const otherIds = new Set(others.map((s) => s.id));
  const names = w.kind === "joystick" ? joystickNames(w.name) : [w.name];
  // Controls and indicators share names and ids (one id space on the hub).
  const nameErr = nameProblem(w.name, w.kind) ?? (names.some((n) => otherNames.has(n)) ? "Another control or indicator is called that." : null);
  const ids = w.kind === "joystick" ? [w.id, w.idY ?? w.id + 1] : [w.id];
  const idErr = ids.some((i) => otherIds.has(i)) ? "Another control or indicator uses this id." : w.kind === "joystick" && ids[0] === ids[1] ? "X and Y need different ids." : null;
  const sym = widgetSymbols(w, fileName)[0];
  const typeConst = sym ? ["remote.INT", "remote.FLOAT", "remote.BOOL", "remote.STR"][sym.type] : "";
  const usage = role === "control"
    ? [
        ...names.map((n) => (isAttrName(n) ? `remote.${n}` : `remote.get("${n}")`)),
        ...ids.map((i) => `remote.send(${i}, value)  # set it`),
      ].join("\n")
    : `remote.create_message(${w.id}, "${w.name}", ${typeConst})\nremote.send(${w.id}, value)`;
  const isInt = w.valueType === "int";
  const group = (id: string, title: string, children: React.ReactNode) => (
    <PropertyGroup title={title} folded={folds.isFolded(id)} onToggle={() => folds.toggle(id)}>{children}</PropertyGroup>
  );

  return (
    <PropertyPanel title={KIND_LABEL[w.kind]} subtitle={role}>
      {group("general", "General", <>
        <TextField label={w.kind === "joystick" ? "Name (sends name_x, name_y)" : "Name"} value={w.name} error={nameErr} onCommit={(v) => onChange({ name: v.trim() })} />
        <FieldRow>
          <NumberField label={w.kind === "joystick" ? "X id" : "Id"} value={w.id} min={0} max={255} int onCommit={(v) => onChange({ id: v })} />
          {w.kind === "joystick" && <NumberField label="Y id" value={w.idY ?? w.id + 1} min={0} max={255} int onCommit={(v) => onChange({ idY: v })} />}
        </FieldRow>
        {idErr && <PropertyNote>{idErr}</PropertyNote>}
      </>)}

      {group("layout", "Position & size", <>
        <FieldRow>
          <NumberField label="X" value={w.x} int onCommit={(x) => onChange({ x })} />
          <NumberField label="Y" value={w.y} int onCommit={(y) => onChange({ y })} />
        </FieldRow>
        <FieldRow>
          <NumberField label="Width" value={w.w} min={MIN_W} int onCommit={(v) => onChange({ w: v })} />
          <NumberField label="Height" value={w.h} min={MIN_H} int onCommit={(v) => onChange({ h: v })} />
        </FieldRow>
      </>)}

      {group("value", "Value", <>
        {(w.kind === "slider" || w.kind === "gauge") && (
          <SelectField grow label="Type" value={w.valueType ?? "int"} options={[["int", "Whole number (int)"], ["float", "Decimal (float)"]]} onChange={(v) => onChange({ valueType: v as ValueType })} />
        )}
        {w.kind === "display" && (
          <SelectField grow label="Type" value={w.valueType ?? "float"} options={[["int", "int"], ["float", "float"], ["bool", "bool"], ["str", "text (str)"]]} onChange={(v) => onChange({ valueType: v as ValueType })} />
        )}
        {(w.kind === "slider" || w.kind === "gauge") && (
          <FieldRow>
            <NumberField label="Min" value={w.min ?? 0} int={isInt} onCommit={(v) => onChange({ min: v })} />
            <NumberField label="Max" value={w.max ?? 100} int={isInt} onCommit={(v) => onChange({ max: v })} />
          </FieldRow>
        )}
        {w.kind === "slider" && (
          <>
            <FieldRow>
              <NumberField label="Step" value={w.step ?? 1} min={0} int={isInt} onCommit={(v) => onChange({ step: v || (isInt ? 1 : 0.1) })} />
              <NumberField label="Start" value={w.initial ?? 0} int={isInt} onCommit={(v) => onChange({ initial: v })} />
            </FieldRow>
            <CheckField label="Return to start when released" value={!!w.springBack} onChange={(v) => onChange({ springBack: v })} />
          </>
        )}
        {w.kind === "joystick" && <NumberField label="Range (±)" value={w.max ?? 100} min={1} int onCommit={(v) => onChange({ max: v })} />}
      </>)}

      {group("appearance", "Appearance", <>
        {w.kind === "gauge" && (
          <SelectField grow label="Style" value={w.style ?? "bar"} options={[["bar", "Bar"], ["dial", "Dial"]]} onChange={(v) => onChange({ style: v as "bar" | "dial" })} />
        )}
        {w.kind === "led" && <ColorField label="Colour" value={w.color ?? "#22c55e"} required onChange={(v) => onChange({ color: v })} />}
      </>)}

      <CodeUsage code={usage} />
      <DeleteButton onClick={onDelete} />
    </PropertyPanel>
  );
}
