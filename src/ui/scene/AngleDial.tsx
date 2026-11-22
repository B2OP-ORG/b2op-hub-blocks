// Arc angle picker: the arc on a dial with draggable start / end handles
// (5° steps, Shift: 1°). Angles as in LVGL: 0 = right, clockwise.

import { useRef, useState } from "react";
import { sweepOf } from "../../scene/geometry";
import { usePalette } from "../theme";
import { arcPath } from "./lvStyle";

const SIZE = 112, C = SIZE / 2, R = 40;

const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
const at = (a: number, r = R): [number, number] => [C + r * Math.cos((a * Math.PI) / 180), C + r * Math.sin((a * Math.PI) / 180)];

export function AngleDial({ start, end, rotation, onChange }: {
  start: number;
  end: number;
  rotation: number;
  onChange: (patch: { startAngle?: number; endAngle?: number }) => void;
}) {
  const p = usePalette();
  const ref = useRef<SVGSVGElement>(null);
  /** Handle being dragged and its live angle (committed on release). */
  const [drag, setDrag] = useState<{ which: "start" | "end"; angle: number } | null>(null);
  const s = drag?.which === "start" ? drag.angle : start;
  const e = drag?.which === "end" ? drag.angle : end;
  const span = sweepOf(s, e);
  const a0 = s + rotation;

  const angleAt = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const deg = (Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180) / Math.PI - rotation;
    const step = ev.shiftKey ? 1 : 5;
    return norm(Math.round(deg / step) * step);
  };
  const handle = (which: "start" | "end", a: number) => {
    const [x, y] = at(a + rotation);
    return (
      <circle cx={x} cy={y} r={7} fill={which === "start" ? p.accent : p.panelBg} stroke={p.accent} strokeWidth={2.5} style={{ cursor: "grab" }}
        onPointerDown={(ev) => { ev.preventDefault(); ref.current?.setPointerCapture(ev.pointerId); setDrag({ which, angle: which === "start" ? start : end }); }}>
        <title>{which === "start" ? `Start ${a}°` : `End ${a}°`} (drag; Shift: 1° steps)</title>
      </circle>
    );
  };

  return (
    <svg ref={ref} width={SIZE} height={SIZE} style={{ alignSelf: "center", touchAction: "none", userSelect: "none" }}
      onPointerMove={(ev) => { if (drag) setDrag({ ...drag, angle: angleAt(ev) }); }}
      onPointerUp={() => {
        if (!drag) return;
        // Equal angles draw nothing in LVGL: nudge the end a step on.
        const a = drag.which === "end" && drag.angle === start ? norm(start + 5) : drag.which === "start" && drag.angle === end ? norm(end - 5) : drag.angle;
        onChange(drag.which === "start" ? { startAngle: a } : { endAngle: a === 0 && start === 0 ? 360 : a });
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}>
      <circle cx={C} cy={C} r={R} fill="none" stroke={p.border} strokeWidth={8} />
      {[0, 90, 180, 270].map((a) => {
        const [x1, y1] = at(a, R + 7), [x2, y2] = at(a, R + 11);
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.dimText} strokeWidth={1.5} />;
      })}
      {span > 0 && <path d={arcPath(C, C, R, a0, a0 + span)} fill="none" stroke={p.accent} strokeWidth={8} strokeLinecap="round" opacity={0.85} />}
      <text x={C} y={C + 4} textAnchor="middle" fontSize={12} fill={p.text}>{span}°</text>
      {handle("end", e)}
      {handle("start", s)}
    </svg>
  );
}
