// Image widgets and project image files: upload (the full image is kept as the
// file's source, the file itself is a PNG that fits the LCD), resizing (the PNG
// is re-rendered at the widget's size, so the hub draws it 1:1) and keeping
// every widget that shows a file in step with its size.

import { relJoin, uniqueName } from "../../project/paths";
import { SCREEN_H, SCREEN_W, moduleOfPath, splitSceneHeader, withSceneHeader, type SceneDoc } from "../../scene/model";
import { sceneToPython } from "../../scene/codegen";
import { isSceneFile, resolveSceneSrc, sceneSrcFor } from "../../scene/project";
import { useApp } from "../../state/store";
import { sanitizeFilename } from "../../utils/sanitize";
import { binaryTypeOf, type AssetRef, type ProjectFile } from "../../project/format";
import { cropOf, fitSize, renderFromSource, sourceOf, storeSource } from "../image/imageOps";

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const stemOf = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

function freePath(path: string): string {
  const st = useApp.getState();
  const lower = new Set([...st.mfp.files.map((f) => f.name.toLowerCase()), ...st.mfp.folders.map((d) => d.toLowerCase())]);
  return uniqueName(path, (c) => lower.has(c.toLowerCase()));
}

function addAssetFile(path: string, asset: AssetRef): void {
  const st = useApp.getState();
  st.addFilesToProject(st.mfp.id, [{ name: path, content: "", asset }], false);
}

/** Rewrite scene files: `fn` returns the changed doc or null. */
export function patchScenes(fn: (scenePath: string, doc: SceneDoc) => SceneDoc | null): void {
  for (const f of useApp.getState().mfp.files) {
    if (!isSceneFile(f)) continue;
    const { doc } = splitSceneHeader(f.content);
    if (!doc) continue;
    const next = fn(f.name, doc);
    if (next) useApp.getState().updateFile(f.id, withSceneHeader(next, sceneToPython(next, moduleOfPath(f.name))));
  }
}

/** Image widgets (in every scene) showing project file `path`. */
function widgetsShowing(path: string): { scene: string; uid: string; w: number; h: number }[] {
  const out: { scene: string; uid: string; w: number; h: number }[] = [];
  for (const f of useApp.getState().mfp.files) {
    if (!isSceneFile(f)) continue;
    for (const w of splitSceneHeader(f.content).doc?.widgets ?? []) {
      if (w.kind === "image" && resolveSceneSrc(f.name, w.src ?? "") === path) out.push({ scene: f.name, uid: w.uid, w: w.w, h: w.h });
    }
  }
  return out;
}

/**
 * Upload: keep `file` as the source, store a PNG of it that fits the LCD under
 * `<scene dir>/images/`. Returns the widget `src` and size.
 */
export async function addSceneImage(scenePath: string, file: File): Promise<{ src: string; w: number; h: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let source;
  try {
    ({ source } = await storeSource(bytes, file.type || binaryTypeOf(file.name) || "image/png"));
  } catch (e) {
    throw new Error(`Not a readable image: ${(e as Error).message}`);
  }
  const size = fitSize(source.width, source.height, SCREEN_W, SCREEN_H);
  const asset = await renderFromSource(source, size.w, size.h);
  const dir = relJoin(dirOf(scenePath), "images");
  const same = useApp.getState().mfp.files.find((f) => f.asset?.hash === asset.hash && f.name.startsWith(dir + "/"));
  if (same) return { src: sceneSrcFor(scenePath, same.name), ...size };
  const path = freePath(relJoin(dir, `${sanitizeFilename(stemOf(file.name)) || "image"}.png`));
  addAssetFile(path, asset);
  return { src: sceneSrcFor(scenePath, path), ...size };
}

/** Aspect ratio (w / h) of what an image file shows, when known. */
export function imageAspect(f: ProjectFile | undefined): number | null {
  const a = f?.asset;
  if (!a) return null;
  if (a.source) { const c = cropOf(a.source); return c.w / c.h; }
  return a.width && a.height ? a.width / a.height : null;
}

/** Re-render runs per widget, newest wins. */
const pending = new Map<string, number>();

/**
 * After image widget `uid` of scene `scenePath` got a new size: re-render its
 * project image at that size. Shared with widgets of another size → the widget
 * gets its own copy (`<name>_<w>x<h>.png`).
 */
export async function fitSceneImage(scenePath: string, uid: string): Promise<void> {
  const ticket = (pending.get(uid) ?? 0) + 1;
  pending.set(uid, ticket);
  const st = useApp.getState();
  const scene = st.mfp.files.find((f) => f.name === scenePath);
  const w = scene && splitSceneHeader(scene.content).doc?.widgets.find((x) => x.uid === uid);
  if (!w || w.kind !== "image") return;
  const path = resolveSceneSrc(scenePath, w.src ?? "");
  const file = path ? st.mfp.files.find((f) => f.name === path) : undefined;
  if (!file?.asset || (file.asset.width === w.w && file.asset.height === w.h)) return;

  const source = await sourceOf(file.asset);
  const asset = await renderFromSource(source, w.w, w.h);
  if (pending.get(uid) !== ticket) return; // resized again meanwhile

  const others = widgetsShowing(file.name).filter((o) => o.uid !== uid && (o.w !== w.w || o.h !== w.h));
  if (!others.length) {
    useApp.getState().setFileAsset(file.id, asset);
    return;
  }
  // Shared: reuse a sibling copy of this size, else make one.
  const now = useApp.getState().mfp.files;
  const copy = now.find((f) => f.asset?.hash === asset.hash && dirOf(f.name) === dirOf(file.name))
    ?? (() => {
      const p = freePath(relJoin(dirOf(file.name), `${stemOf(file.name)}_${w.w}x${w.h}.png`));
      addAssetFile(p, asset);
      return { name: p };
    })();
  patchScenes((sp, doc) => sp !== scenePath ? null : ({
    ...doc, widgets: doc.widgets.map((x) => (x.uid === uid ? { ...x, src: sceneSrcFor(scenePath, copy.name) } : x)),
  }));
}

/**
 * Crop (or restore with `crop` undefined) project image file `fileId`: the new
 * PNG fits the LCD like an upload does, and every widget showing it takes the
 * new size.
 */
export async function cropImageFile(fileId: string, crop: { x: number; y: number; w: number; h: number } | undefined): Promise<void> {
  const file = useApp.getState().mfp.files.find((f) => f.id === fileId);
  if (!file?.asset) return;
  const base = await sourceOf(file.asset);
  const source = { ...base };
  if (crop && !(crop.x === 0 && crop.y === 0 && crop.w === base.width && crop.h === base.height)) source.crop = crop;
  else delete source.crop;
  const c = cropOf(source);
  const out = fitSize(c.w, c.h, SCREEN_W, SCREEN_H);
  const asset = await renderFromSource(source, out.w, out.h);
  useApp.getState().setFileAsset(file.id, asset);
  const users = new Set(widgetsShowing(file.name).map((u) => u.uid));
  if (users.size) {
    patchScenes((_, doc) => doc.widgets.some((x) => users.has(x.uid))
      ? { ...doc, widgets: doc.widgets.map((x) => (users.has(x.uid) ? { ...x, w: out.w, h: out.h } : x)) }
      : null);
  }
}
