import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Progressive compaction for a toolbar that must fit on one line. Returns a
 * level 0…max: after every render, if `ref` overflows the level steps up
 * (before paint, no flicker); when the element grows it steps back down.
 */
export function useCompactLevel(ref: React.RefObject<HTMLElement | null>, max: number): number {
  const [level, setLevel] = useState(0);
  const [, forceUpdate] = useState(0);
  const levelRef = useRef(0);

  useEffect(() => { levelRef.current = level; }, [level]);

  // After every render: if overflowing, step up one level (deliberately no deps).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth && level < max) setLevel(level + 1);
  });

  // On width increase try stepping down; on any change re-render so the
  // layout effect above can detect overflow at the new size.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let prevWidth = el.clientWidth;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > prevWidth && levelRef.current > 0) {
        setLevel((l) => Math.max(l - 1, 0));
      } else if (w !== prevWidth) {
        forceUpdate((n) => n + 1);
      }
      prevWidth = w;
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);

  return level;
}
