// Pure helpers for the Examples tab (no Vite virtual imports, so testable).

export interface ExampleEntry {
  /** File name or folder name at the top of public/examples/. */
  id: string;
  title: string;
  /** Paths relative to public/examples/. One for a file example, several for a folder. */
  files: string[];
  folder: boolean;
}

/** "grove_i2c_mpu6050.py" → "Grove i2c mpu6050", "dumbCar.py" → "Dumb car". */
export function exampleTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

/** Group a flat file list into top-level examples (files and folders). */
export function groupExamples(paths: string[]): ExampleEntry[] {
  const byTop = new Map<string, string[]>();
  for (const p of paths) {
    const top = p.split("/")[0];
    byTop.set(top, [...(byTop.get(top) ?? []), p]);
  }
  return [...byTop.entries()]
    .map(([id, files]) => ({ id, title: exampleTitle(id), files: files.sort(), folder: files.some((f) => f.includes("/")) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** First line of a module docstring or leading comment, if any. */
export function exampleDescription(src: string): string {
  const doc = /^\s*(?:#![^\n]*\n)?\s*(?:"""|''')\s*([^\n]*?)\s*(?:\n|"""|''')/.exec(src);
  if (doc?.[1]) return doc[1];
  const comment = /^\s*#\s*(?!!)([^\n]+)/.exec(src);
  return comment ? comment[1].trim() : "";
}

/** Project-relative path for a file inside a folder example (strip the folder). */
export const pathInExample = (entry: ExampleEntry, file: string) =>
  entry.folder ? file.slice(entry.id.length + 1) : file;
