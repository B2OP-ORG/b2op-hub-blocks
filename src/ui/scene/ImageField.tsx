import { useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import type { SceneWidget } from "../../scene/model";
import { resolveSceneSrc, sceneSrcFor } from "../../scene/project";
import { useApp } from "../../state/store";
import { pickFile } from "../../utils/download";
import { Button } from "../components/Button";
import { FieldRow } from "../components/Field";
import { PropertyNote } from "../components/PropertyPanel";
import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import { CheckField } from "../components/CheckField";
import { addSceneImage } from "./imageUpload";

/** Image widget source: upload into the project, pick a project image, or type a path. */
export function ImageField({ w, scenePath, onChange }: {
  w: SceneWidget;
  scenePath: string;
  onChange: (patch: Partial<SceneWidget>) => void;
}) {
  const files = useApp((s) => s.mfp.files);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = w.src ?? "";
  const images = files.filter((f) => f.asset?.type.startsWith("image/"));
  const target = resolveSceneSrc(scenePath, src);
  const file = target ? files.find((f) => f.name === target) : undefined;

  const upload = async () => {
    const picked = await pickFile("image/*");
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const r = await addSceneImage(scenePath, picked);
      onChange({ src: r.src, w: r.w, h: r.h });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (path: string) => {
    const f = images.find((x) => x.name === path);
    if (!f) return;
    const size = f.asset?.width && f.asset.height ? { w: f.asset.width, h: f.asset.height } : {};
    onChange({ src: sceneSrcFor(scenePath, f.name), ...size });
  };

  return (
    <>
      <FieldRow>
        <Button icon={<Upload size={13} />} onClick={upload} disabled={busy} title="Any image: the original is kept, the project gets a PNG that fits the screen (resize the widget to scale it, crop it in the image view)">
          {busy ? "Converting…" : "Upload image…"}
        </Button>
        {file && (
          <Button icon={<ExternalLink size={13} />} onClick={() => useApp.getState().openFile(file.id)} title={`Open ${file.name}`}>Open</Button>
        )}
      </FieldRow>
      {error && <PropertyNote>{error}</PropertyNote>}
      {images.length > 0 && (
        <SelectField grow label="Project image" value={file?.asset ? file.name : ""}
          options={[["", file?.asset ? "—" : "(choose…)"], ...images.map((f): [string, string] => [f.name, f.name])]}
          onChange={pick} />
      )}
      <CheckField label="Keep aspect ratio when resizing" value={w.keepAspect !== false} onChange={(v) => onChange({ keepAspect: v ? undefined : false })} />
      <TextField label="Path (relative to this file, or /sd/…)" value={src} onCommit={(v) => onChange({ src: v.trim() })} />
      {src && !src.startsWith("/") && !file?.asset && <PropertyNote tone="warn">Not in the project: upload it, or make sure the hub has it.</PropertyNote>}
      {file?.asset && <PropertyNote tone="dim">{file.asset.width && file.asset.height ? `${file.asset.width} × ${file.asset.height} px · ` : ""}{(file.asset.size / 1024).toFixed(1)} KB</PropertyNote>}
    </>
  );
}
