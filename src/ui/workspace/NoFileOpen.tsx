import { useApp } from "../../state/store";
import { usePalette } from "../theme";
import { newFileFlow } from "../actions";
import { Button } from "../components/Button";

/** Workspace placeholder when no file tab is open: open main.py (or the first file), or create one. */
export function NoFileOpen() {
  const p = usePalette();
  const files = useApp((s) => s.mfp.files);
  const openFile = useApp((s) => s.openFile);
  const main = files.find((f) => f.name === "main.py") ?? files[0];
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: p.dimText, fontSize: 13, textAlign: "center", padding: 20 }}>
      <div>
        <div style={{ marginBottom: 10 }}>No file open.</div>
        {main
          ? <Button variant="primary" onClick={() => openFile(main.id)}>Open {main.name}</Button>
          : <Button variant="primary" onClick={() => newFileFlow()}>New file…</Button>}
      </div>
    </div>
  );
}
