import { isAttrName, roleOf, type RemoteLayout } from "../../remote/layout";
import { usePalette } from "../theme";
import { CodeUsage, PropertyPanel } from "../components/PropertyPanel";

/** Inspector when nothing is selected: the controller as a whole and how to use it. */
export function LayoutProperties({ layout, fileName, conflicts }: {
  layout: RemoteLayout;
  fileName: string;
  /** Widgets whose name or id clashes with another one of the project. */
  conflicts: number;
}) {
  const p = usePalette();
  const controls = layout.widgets.filter((w) => roleOf(w.kind) === "control");
  const indicators = layout.widgets.filter((w) => roleOf(w.kind) === "indicator");
  const c = controls.find((w) => w.kind !== "joystick") ?? controls[0];
  const ind = indicators[0];
  const read = c ? (c.kind === "joystick" ? `${c.name}_x` : c.name) : "";
  const code = [
    "import remote",
    ...(c ? [`${isAttrName(read) ? `remote.${read}` : `remote.get("${read}")`}  # read a control`] : []),
    ...(ind ? [`remote.send(${ind.id}, value)  # update ${ind.name}`] : []),
  ].join("\n");
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <PropertyPanel title="Controller" subtitle={fileName}>
      <div style={{ fontSize: 12, color: p.text }}>{plural(controls.length, "control")} · {plural(indicators.length, "indicator")}</div>
      {conflicts > 0 && (
        <div style={{ color: p.danger, fontSize: 12 }}>
          {conflicts === 1 ? "1 widget has" : `${conflicts} widgets have`} a name or id used elsewhere in the project (red outline).
        </div>
      )}
      <CodeUsage code={code} />
      <div style={{ fontSize: 12, color: p.dimText, lineHeight: 1.5 }}>
        Select a widget to edit its properties. Drag one onto the bin, or back onto the toolbox, to delete it.
        Run a program to use the controller, or try it in Preview.
      </div>
    </PropertyPanel>
  );
}
