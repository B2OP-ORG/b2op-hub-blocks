import { EVENT_KINDS, type SceneDoc } from "../../scene/model";
import { usePalette } from "../theme";
import { CodeUsage, PropertyPanel } from "../components/PropertyPanel";
import { ColorField } from "../components/ColorField";

/** Inspector when nothing is selected: scene-wide settings and how to use it. */
export function SceneProperties({ doc, module, onChange }: { doc: SceneDoc; module: string; onChange: (patch: Partial<SceneDoc>) => void }) {
  const p = usePalette();
  const events = doc.widgets.filter((w) => EVENT_KINDS.includes(w.kind));
  const nested = module.includes(".");
  return (
    <PropertyPanel title="Scene" subtitle={module}>
      <ColorField label="Background" value={doc.bg} onChange={(v) => onChange({ bg: v ?? "#000000" })} required />
      <CodeUsage code={[`import ${module}`, `${module}.show()`, ...(events[0] ? [`${module}.on("${events[0].name}", my_function)`] : [])].join("\n")} />
      {nested && <div style={{ color: p.warnText, fontSize: 12 }}>This scene is in a folder. If <code>import {module}</code> fails on the hub, move it to the project's top level.</div>}
      <div style={{ fontSize: 12, color: p.dimText, lineHeight: 1.5 }}>
        Keep calling <code>lv.timer_handler()</code> (loops in blocks do it for you) so the screen updates and button events arrive.
        On the hub: ↑ ↓ move the focus, center presses / starts editing, left stops editing.
      </div>
    </PropertyPanel>
  );
}
