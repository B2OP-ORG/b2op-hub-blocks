import files from "virtual:examples";
import { groupExamples, type ExampleEntry } from "./model";

export * from "./model";

export const EXAMPLES: ExampleEntry[] = groupExamples(files);

const cache = new Map<string, Promise<string>>();

/** Fetch an example file's contents from the public folder (cached). */
export function fetchExample(path: string): Promise<string> {
  let p = cache.get(path);
  if (!p) {
    const url = `${import.meta.env.BASE_URL}examples/${path.split("/").map(encodeURIComponent).join("/")}`;
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load example ${path} (${r.status})`);
      return r.text();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}
