// Read-only viewer for image files of the project (bytes in the asset store).
// Pixels are drawn sharp (no smoothing) so LCD-sized images can be inspected.

import { useEffect, useRef, useState } from "react";
import { Check, Crop, Download, Image as ImageIcon, RotateCcw, X } from "lucide-react";
import type { CropRect, ImageSource, ProjectFile } from "../../project/format";
import { useApp } from "../../state/store";
import { downloadProjectFile } from "../actions/files";
import { Button } from "../components/Button";
import { Toolbar } from "../components/Toolbar";
import { ZoomControls } from "../components/ZoomControls";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, useCanvasView } from "../hooks/useCanvasView";
import { useAssetUrl } from "../hooks/useAssetUrl";
import { usePalette } from "../theme";
import { showAlert } from "../dialog";
import { cropImageFile } from "../scene/imageUpload";
import { CropEditor } from "./CropEditor";
import { cropOf, sourceOf } from "./imageOps";

/** CSS px per image px at 100%. */
const BASE = 3;
/** Content px around the image. */
const PAD = 16;

export function ImageView({ file }: { file: ProjectFile }) {
  const p = usePalette();
  const canvasRef = useRef<HTMLDivElement>(null);
  const projectId = useApp((s) => s.mfp.id);
  const url = useAssetUrl(file.asset);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const cv = useCanvasView({ canvasRef, storageKey: `b2op.imageZoom.${projectId}.${file.id}`, isControl: () => false });
  const { zoom } = cv;
  const scale = zoom * BASE;
  const w = natural?.w ?? file.asset?.width ?? 0, h = natural?.h ?? file.asset?.height ?? 0;
  const asset = file.asset;
  const panCursor = cv.panning ? "grabbing" : cv.spaceHeld ? "grab" : undefined;
  const fit = () => cv.fit(0, 0, (w + PAD * 2) * BASE, (h + PAD * 2) * BASE);
  // ── Crop mode ──
  const [crop, setCrop] = useState<{ source: ImageSource; rect: CropRect } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCrop(null); }, [file.id]);
  const startCrop = async () => {
    if (!asset) return;
    try {
      const source = await sourceOf(asset);
      setCrop({ source, rect: cropOf(source) });
    } catch (e) {
      await showAlert("Can't crop", (e as Error).message);
    }
  };
  const run = async (c: CropRect | undefined) => {
    setBusy(true);
    try {
      await cropImageFile(file.id, c);
      setCrop(null);
    } catch (e) {
      await showAlert(c ? "Can't crop" : "Can't restore", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cropped = !!asset?.source?.crop;

  const checker = `repeating-conic-gradient(${p.dark ? "#2a2f36" : "#d9dde3"} 0% 25%, ${p.dark ? "#1d2127" : "#f3f4f6"} 0% 50%) 0 0 / 16px 16px`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: p.text, fontSize: 13 }}>
      <Toolbar maxCompact={2}>{(c) => <>
        <ImageIcon size={15} color={p.accent} />
        <code style={{ fontSize: 11, color: p.dimText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{file.name}</code>
        {c < 2 && asset && (
          <span style={{ fontSize: 11, color: p.dimText, whiteSpace: "nowrap" }}>
            {w && h ? `${w} × ${h} px · ` : ""}{(asset.size / 1024).toFixed(1)} KB · {asset.type.replace("image/", "").toUpperCase()} · read-only
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!crop && <ZoomControls
          percent={zoom * 100}
          canZoomOut={zoom > MIN_ZOOM} canZoomIn={zoom < MAX_ZOOM}
          onZoomOut={() => cv.zoomTo(zoom / ZOOM_STEP)} onZoomIn={() => cv.zoomTo(zoom * ZOOM_STEP)} onReset={() => cv.zoomTo(1)}
          onFit={fit} fitTitle="Fit the image into view" hidePercent={c >= 1}
        />}
        {crop ? (
          <>
            <span style={{ fontSize: 11, color: p.dimText, whiteSpace: "nowrap" }}>{crop.rect.w} × {crop.rect.h} of {crop.source.width} × {crop.source.height}</span>
            <Button size="sm" onClick={() => setCrop({ ...crop, rect: { x: 0, y: 0, w: crop.source.width, h: crop.source.height } })} title="Select the whole original">All</Button>
            <Button size="sm" variant="primary" icon={<Check size={13} />} disabled={busy} onClick={() => void run(crop.rect)} title="Crop to the rectangle (the original is kept)">Apply</Button>
            <Button size="sm" icon={<X size={13} />} disabled={busy} onClick={() => setCrop(null)} title="Leave crop mode without changes">Cancel</Button>
          </>
        ) : asset && (
          <>
            <Button size="sm" icon={<Crop size={13} />} onClick={() => void startCrop()} title="Crop the image (the full original stays stored)">{c < 1 ? "Crop" : null}</Button>
            {cropped && <Button size="sm" icon={<RotateCcw size={13} />} disabled={busy} onClick={() => void run(undefined)} title="Undo the crop: back to the whole original">{c < 1 ? "Restore original" : null}</Button>}
          </>
        )}
        <Button size="sm" icon={<Download size={13} />} onClick={() => void downloadProjectFile(file.id)} title="Download this image">{c < 1 ? "Download" : null}</Button>
      </>}</Toolbar>

      <div ref={canvasRef} tabIndex={0} className="pan-canvas" {...cv.handlers} onKeyDown={(e) => { cv.onKeyDown(e); }}
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", outline: "none", background: p.panelAltBg, cursor: panCursor }}>
        {crop ? (
          <CropEditor source={crop.source} crop={crop.rect} onChange={(rect) => setCrop((c) => (c ? { ...c, rect } : c))} />
        ) : url === null ? (
          <div style={{ padding: 24, color: p.dimText, lineHeight: 1.5 }}>
            This image's data isn't stored in this browser (it was removed, or the project came from another browser without it).
            Import the image again, or load it from the hub.
          </div>
        ) : url && (
          <div style={{ position: "relative", width: (w + PAD * 2) * scale, height: (h + PAD * 2) * scale, margin: "0 auto" }}>
            <div style={{ position: "absolute", left: PAD * scale, top: PAD * scale, width: w * scale, height: h * scale, background: checker, boxShadow: "0 2px 8px rgba(0,0,0,.3)" }}>
              <img src={url} alt={file.name} draggable={false}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                style={{ display: "block", width: w * scale || undefined, height: h * scale || undefined, imageRendering: "pixelated", userSelect: "none" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
