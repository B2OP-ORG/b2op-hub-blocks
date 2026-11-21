import { useApp, EXAMPLE_PREVIEW_ID } from "../../state/store";
import { EXAMPLES } from "../../examples";
import { EmptyNote } from "../components/EmptyNote";
import { PanelHeader } from "../components/PanelHeader";
import { ExampleRow } from "./ExampleRow";

export function ExamplesTab() {
  const previewRef = useApp((s) => (s.activeExtraTab === EXAMPLE_PREVIEW_ID ? s.extraTabs.find((t) => t.id === EXAMPLE_PREVIEW_ID)?.ref ?? null : null));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <PanelHeader title="Examples" />
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
        {EXAMPLES.length === 0
          ? <EmptyNote>No examples found.</EmptyNote>
          : <>
              <EmptyNote>Click an example to look at its code. Right-click to open it as a project or add it to yours.</EmptyNote>
              {EXAMPLES.map((e) => <ExampleRow key={e.id} entry={e} previewRef={previewRef} />)}
            </>}
      </div>
    </div>
  );
}
