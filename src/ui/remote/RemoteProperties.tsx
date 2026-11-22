import { KIND_LABEL, isAttrName, joystickNames, nameProblem, roleOf, widgetSymbols, type RemoteSymbol, type ValueType, type Widget } from "../../remote/layout";
import { CheckField } from "../components/CheckField";
import { ColorField } from "../components/ColorField";
import { FieldRow } from "../components/Field";
import { NumberField } from "../components/NumberField";
import { CodeUsage, DeleteButton, PropertyNote, PropertyPanel } from "../components/PropertyPanel";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";

/** Inspector for the selected remote widget. */
export function RemoteProperties({ w, fileName, others, onChange, onDelete }: {
  w: Widget;
  fileName: string;
  /** Symbols of the other widgets with the same role (whole project). */
  others: RemoteSymbol[];
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

  return (
    <PropertyPanel title={KIND_LABEL[w.kind]} subtitle={role}>
      <TextField label={w.kind === "joystick" ? "Name (sends name_x, name_y)" : "Name"} value={w.name} error={nameErr} onCommit={(v) => onChange({ name: v.trim() })} />
      <FieldRow>
        <NumberField label={w.kind === "joystick" ? "X id" : "Id"} value={w.id} min={0} max={255} int onCommit={(v) => onChange({ id: v })} />
        {w.kind === "joystick" && <NumberField label="Y id" value={w.idY ?? w.id + 1} min={0} max={255} int onCommit={(v) => onChange({ idY: v })} />}
      </FieldRow>
      {idErr && <PropertyNote>{idErr}</PropertyNote>}

      {(w.kind === "slider" || w.kind === "gauge") && (
        <SelectField label="Type" value={w.valueType ?? "int"} options={[["int", "Whole number (int)"], ["float", "Decimal (float)"]]} onChange={(v) => onChange({ valueType: v as ValueType })} />
      )}
      {w.kind === "display" && (
        <SelectField label="Type" value={w.valueType ?? "float"} options={[["int", "int"], ["float", "float"], ["bool", "bool"], ["str", "text (str)"]]} onChange={(v) => onChange({ valueType: v as ValueType })} />
      )}
      {(w.kind === "slider" || w.kind === "gauge") && (
        <FieldRow>
          <NumberField label="Min" value={w.min ?? 0} int={w.valueType === "int"} onCommit={(v) => onChange({ min: v })} />
          <NumberField label="Max" value={w.max ?? 100} int={w.valueType === "int"} onCommit={(v) => onChange({ max: v })} />
        </FieldRow>
      )}
      {w.kind === "slider" && (
        <>
          <FieldRow>
            <NumberField label="Step" value={w.step ?? 1} min={0} int={w.valueType === "int"} onCommit={(v) => onChange({ step: v || (w.valueType === "int" ? 1 : 0.1) })} />
            <NumberField label="Start" value={w.initial ?? 0} int={w.valueType === "int"} onCommit={(v) => onChange({ initial: v })} />
          </FieldRow>
          <CheckField label="Return to start when released" value={!!w.springBack} onChange={(v) => onChange({ springBack: v })} />
        </>
      )}
      {w.kind === "joystick" && <NumberField label="Range (±)" value={w.max ?? 100} min={1} int onCommit={(v) => onChange({ max: v })} />}
      {w.kind === "gauge" && (
        <SelectField label="Style" value={w.style ?? "bar"} options={[["bar", "Bar"], ["dial", "Dial"]]} onChange={(v) => onChange({ style: v as "bar" | "dial" })} />
      )}
      {w.kind === "led" && <ColorField label="Colour" value={w.color ?? "#22c55e"} required onChange={(v) => onChange({ color: v })} />}

      <CodeUsage code={usage} />
      <DeleteButton onClick={onDelete} />
    </PropertyPanel>
  );
}
