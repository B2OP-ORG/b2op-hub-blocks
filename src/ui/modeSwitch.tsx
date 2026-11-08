// Python ↔ Blocks switching for the active file, with the confirmation dialogs.

import { useApp } from "../state/store";
import { fileMode, splitBlocksHeader, withBlocksHeader } from "../project/format";
import { checkTranslation, emptyWorkspace, pythonFromWorkspace, samePython } from "../project/modeSwitch";
import { showChoice, showConfirm } from "./Dialog";

function Warn({ children }: { children: React.ReactNode }) {
  const dark = useApp.getState().editorSettings.darkMode;
  return (
    <div style={{
      background: dark ? "#3f1d1d" : "#fef2f2",
      border: `1px solid ${dark ? "#7f1d1d" : "#fecaca"}`,
      color: dark ? "#fecaca" : "#7f1d1d",
      padding: "6px 10px",
      borderRadius: 6,
      margin: "6px 0",
      fontSize: 13,
    }}>
      {children}
    </div>
  );
}

function Ok({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, margin: "6px 0", opacity: 0.85 }}>✓ {children}</div>;
}

let switching = false;

export async function switchActiveFileMode(): Promise<void> {
  if (switching) return;
  switching = true;
  try {
    const s = useApp.getState();
    const file = s.mfp.files.find((f) => f.id === s.activeFileId);
    if (!file) return;
    if (fileMode(file) === "blocks") await blocksToPython(file.id, file.content);
    else await pythonToBlocksSwitch(file.id, file.content);
  } finally {
    switching = false;
  }
}

async function blocksToPython(fileId: string, content: string): Promise<void> {
  const { body } = splitBlocksHeader(content);
  const check = await checkTranslation(body);
  if (check.hasRaw || !check.roundTripOk) {
    const choice = await showChoice(
      "Switch to Python?",
      <Warn>
        <strong>Going back to Blocks won't be lossless.</strong> The generated Python doesn't round-trip cleanly to the current blocks:
        <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
          {check.hasRaw && <li>It contains constructs that only exist as "raw Python" blocks.</li>}
          {!check.roundTripOk && <li>Re-parsing the Python doesn't reproduce the current workspace exactly.</li>}
        </ul>
        <p style={{ marginTop: 8, marginBottom: 0 }}>
          The saved blocks stay in the file's first line, so you can load them again when switching back.
          Edits you make in Python would then be lost.
        </p>
      </Warn>,
      [{ value: "cancel", label: "Cancel" }, { value: "go", label: "Switch anyway", kind: "primary" }],
      "cancel",
    );
    if (choice !== "go") return;
  }
  // Keep the header so the blocks can be restored later.
  useApp.getState().setFileMode(fileId, "python", content);
}

async function pythonToBlocksSwitch(fileId: string, content: string): Promise<void> {
  const { workspace: saved, body } = splitBlocksHeader(content);
  const set = (ws: unknown, python: string) => useApp.getState().setFileMode(fileId, "blocks", withBlocksHeader(ws, python));

  if (saved === null) {
    const check = await checkTranslation(body);
    if (!check.hasRaw && check.roundTripOk) { set(check.workspace, check.regen); return; }
    const choice = await showChoice(
      "Switch to Blocks?",
      <>
        <p style={{ marginTop: 0 }}>This Python can't be fully translated to blocks:</p>
        {check.hasRaw && <Warn>Some code doesn't map to any block. It will stay inside "raw Python" blocks.</Warn>}
        {!check.roundTripOk && <Warn><strong>Round-trip check failed:</strong> regenerating Python from the new blocks doesn't reproduce the original exactly. Behaviour may change.</Warn>}
        <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
          <li><strong>Best effort</strong>: translate what's possible and keep the rest as raw Python.</li>
          <li><strong>Discard</strong>: start with an empty blocks workspace.</li>
        </ul>
      </>,
      [
        { value: "cancel", label: "Cancel" },
        { value: "discard", label: "Discard", kind: "danger" },
        { value: "best", label: "Best effort", kind: "primary" },
      ],
      "cancel",
    );
    if (choice === "best") set(check.workspace, check.regen);
    else if (choice === "discard" && await confirmDiscard()) set(emptyWorkspace(), "");
    return;
  }

  // The file carries saved blocks: offer to load them or regenerate from the Python.
  const [savedPython, gen] = await Promise.all([pythonFromWorkspace(saved), checkTranslation(body)]);
  const pythonEdited = !samePython(savedPython, body);
  const choice = await showChoice(
    "Switch to Blocks",
    <>
      <p style={{ marginTop: 0 }}>This file has saved blocks. How do you want to continue?</p>

      <div style={{ fontWeight: 700, marginTop: 10 }}>Load saved blocks</div>
      {pythonEdited
        ? <Warn>The Python was edited since these blocks were saved. Loading them <strong>throws away those Python edits</strong>.</Warn>
        : <Ok>The saved blocks match the current Python.</Ok>}

      <div style={{ fontWeight: 700, marginTop: 10 }}>Generate new blocks from the Python</div>
      {gen.hasRaw && <Warn>Some code doesn't map to any block. It will stay inside "raw Python" blocks.</Warn>}
      {!gen.roundTripOk && <Warn><strong>Round-trip check failed:</strong> Python regenerated from the new blocks doesn't match the current source.</Warn>}
      {!gen.hasRaw && gen.roundTripOk && <Ok>The Python translates cleanly. Block positions will be reset.</Ok>}

      <div style={{ fontWeight: 700, marginTop: 10 }}>Discard</div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>Throw away the Python and the saved blocks, and start from an empty workspace.</div>
    </>,
    [
      { value: "cancel", label: "Cancel" },
      { value: "discard", label: "Discard", kind: "danger" },
      { value: "generate", label: "Generate new blocks" },
      { value: "load", label: "Load saved blocks", kind: "primary" },
    ],
    "cancel",
  );
  if (choice === "load") set(saved, savedPython);
  else if (choice === "generate") set(gen.workspace, gen.regen);
  else if (choice === "discard" && await confirmDiscard()) set(emptyWorkspace(), "");
}

function confirmDiscard(): Promise<boolean> {
  return showConfirm(
    "Discard this file's code?",
    "The Python and any saved blocks in this file will be replaced by an empty blocks workspace. This can't be undone.",
    { confirmLabel: "Discard", danger: true },
  );
}
