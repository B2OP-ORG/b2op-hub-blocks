// Path helpers for project-relative paths ("lib/util.py") and device paths ("/sd/x").

/**
 * Normalise a project-relative path: "/" separators, no leading/trailing
 * slashes, no empty / "." segments. Returns null if it escapes the project
 * ("..") or ends up empty.
 */
export function normalizeRelPath(path: string): string | null {
  const segs: string[] = [];
  for (const seg of path.replace(/\\/g, "/").split("/")) {
    const s = seg.trim();
    if (!s || s === ".") continue;
    if (s === "..") return null;
    segs.push(s);
  }
  return segs.length ? segs.join("/") : null;
}

/** Parent of a project-relative path ("" for top level). */
export function relDirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function relJoin(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** All ancestor folders of a relative path, outermost first ("a/b/c.py" → ["a", "a/b"]). */
export function ancestorDirs(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

/** True if `path` is `dir` itself or lies inside it. */
export function isWithin(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + "/");
}

// ── Device (absolute) paths ──────────────────────────────────────────────────

export function devJoin(dir: string, name: string): string {
  return dir.replace(/\/+$/, "") + "/" + name;
}

export function devParent(path: string): string {
  const p = path.replace(/\/+$/, "");
  const idx = p.lastIndexOf("/");
  return idx <= 0 ? "/" : p.slice(0, idx);
}

export function devBaseName(path: string): string {
  const p = path.replace(/\/+$/, "");
  return p.slice(p.lastIndexOf("/") + 1);
}

/** Make a name unique against `taken` by appending _1, _2… before the extension. */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const m = name.match(/^(.*?)(\.[^./]+)?$/);
  const stem = m?.[1] ?? name;
  const ext = m?.[2] ?? "";
  for (let n = 1; ; n++) {
    const c = `${stem}_${n}${ext}`;
    if (!taken(c)) return c;
  }
}
