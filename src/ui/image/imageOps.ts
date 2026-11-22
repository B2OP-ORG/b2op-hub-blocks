// Image files: decode, crop and re-encode in the browser. An image file keeps
// the full image it was made from (`asset.source`, bytes in the asset store),
// so crops and resizes are always redone from full quality and can be undone.

import { getAssetBytes, putAsset } from "../../project/assets";
import type { AssetRef, CropRect, ImageSource } from "../../project/format";

const decoded = new Map<string, Promise<HTMLImageElement>>();

/** Decode image bytes (cached per asset hash when `hash` is given). */
export function decodeImage(bytes: Uint8Array | Blob, type: string, hash?: string): Promise<HTMLImageElement> {
  const cached = hash ? decoded.get(hash) : undefined;
  if (cached) return cached;
  const p = (async () => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      // The decoded pixels stay usable for drawImage after revoking.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  })();
  if (hash) {
    decoded.set(hash, p);
    p.catch(() => decoded.delete(hash));
  }
  return p;
}

/** Natural size; SVGs without one count as `fallback`. */
export function naturalSize(img: HTMLImageElement, fallback = { w: 160, h: 128 }): { w: number; h: number } {
  return { w: img.naturalWidth || fallback.w, h: img.naturalHeight || fallback.h };
}

/** Largest size of aspect w:h that fits max W × H, never enlarging. */
export function fitSize(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Size of aspect w:h scaled to fit inside box W × H (may enlarge). */
export function fitInto(w: number, h: number, boxW: number, boxH: number): { w: number; h: number } {
  const s = Math.min(boxW / w, boxH / h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Draw `crop` of `img` (whole image when absent) at w × h and encode it as PNG. */
export async function renderPng(img: HTMLImageElement, crop: CropRect | undefined, w: number, h: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  const n = naturalSize(img);
  const c = crop ?? { x: 0, y: 0, w: n.w, h: n.h };
  ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Couldn't encode the PNG.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Store raw image bytes as a source (the full image). */
export async function storeSource(bytes: Uint8Array, type: string): Promise<{ source: ImageSource; img: HTMLImageElement }> {
  const hash = await putAsset(bytes);
  const img = await decodeImage(bytes, type, hash);
  const n = naturalSize(img);
  return { source: { hash, type, size: bytes.length, width: n.w, height: n.h }, img };
}

/** The source of an image file: its stored original, or (older / imported files) the file itself. */
export async function sourceOf(asset: AssetRef): Promise<ImageSource> {
  if (asset.source) return asset.source;
  if (asset.width && asset.height) return { hash: asset.hash, type: asset.type, size: asset.size, width: asset.width, height: asset.height };
  const bytes = await getAssetBytes(asset.hash);
  if (!bytes) throw new Error("The image's data isn't stored in this browser.");
  const n = naturalSize(await decodeImage(bytes, asset.type, asset.hash));
  return { hash: asset.hash, type: asset.type, size: asset.size, width: n.w, height: n.h };
}

/** The visible part of a source (its crop, or the whole image). */
export function cropOf(source: ImageSource): CropRect {
  return source.crop ?? { x: 0, y: 0, w: source.width, h: source.height };
}

/** Render a source (with its crop) at w × h into a new PNG asset. */
export async function renderFromSource(source: ImageSource, w: number, h: number): Promise<AssetRef> {
  const bytes = await getAssetBytes(source.hash);
  if (!bytes) throw new Error("The original image isn't stored in this browser.");
  const img = await decodeImage(bytes, source.type, source.hash);
  const png = await renderPng(img, source.crop, w, h);
  const hash = await putAsset(png);
  return { hash, type: "image/png", size: png.length, width: w, height: h, source };
}
