import { usePalette } from "../theme";

function crumbs(cwd: string): { label: string; path: string }[] {
  const out = [{ label: "/", path: "/" }];
  let acc = "";
  for (const part of cwd.split("/").filter(Boolean)) {
    acc += "/" + part;
    out.push({ label: part, path: acc });
  }
  return out;
}

/** Clickable path of the current SD card folder (folders outside /sd disabled unless allowed). */
export function Breadcrumbs({ cwd, allowRoot, disabled, onNavigate }: { cwd: string; allowRoot: boolean; disabled: boolean; onNavigate: (path: string) => void }) {
  const p = usePalette();
  const path = crumbs(cwd);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, padding: "4px 10px", borderBottom: `1px solid ${p.border}`, fontSize: 12 }}>
      {path.map((c, i) => {
        const allowed = allowRoot || c.path.startsWith("/sd");
        return (
          <span key={c.path} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            {i > 1 && <span style={{ opacity: 0.4 }}>/</span>}
            <button
              type="button"
              disabled={!allowed || disabled}
              onClick={() => onNavigate(c.path)}
              style={{
                background: "none", border: "none", padding: "1px 3px", borderRadius: 3, color: p.text,
                fontWeight: i === path.length - 1 ? 700 : 400, cursor: allowed ? "pointer" : "default",
                opacity: allowed ? 1 : 0.45, fontSize: 12, overflowWrap: "anywhere", textAlign: "left",
              }}
            >
              {c.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
