import { useState } from "react";
import * as Blockly from "blockly/core";
import { useApp } from "../state/store";
import { downloadProject, pickFile } from "../project/download";
import type { BlocksProject } from "../project/format";
import { newBlocksProject, newPythonProject, parseProject } from "../project/format";
import { hasRawBlock, normalizePython, pythonToBlocks } from "../project/pythonToBlocks";
import { workspaceToPython } from "../codegen/pythonGen";

interface Props {
  onOpenSettings: () => void;
}

function blocksProjectFromPython(source: string, title: string, settings: BlocksProject["settings"]): BlocksProject {
  const base = newBlocksProject(title);
  const { main, buttonHats, variables } = pythonToBlocks(source);
  const topBlocks: Record<string, unknown>[] = [];
  const programHat: Record<string, unknown> = { type: "when_program_starts", x: 40, y: 40 };
  if (main) programHat.inputs = { DO: { block: main } };
  topBlocks.push(programHat);
  buttonHats.forEach((h, i) => {
    const b: Record<string, unknown> = {
      type: "on_button_pressed",
      x: 320,
      y: 40 + i * 140,
      fields: { BTN: h.btn },
    };
    if (h.chain) b.inputs = { DO: { block: h.chain } };
    topBlocks.push(b);
  });
  const workspace: Record<string, unknown> = {
    blocks: {
      languageVersion: 0,
      blocks: topBlocks,
    },
  };
  if (variables.length) workspace.variables = variables;
  return { ...base, settings, workspace };
}

interface TranslationCheck {
  hasRaw: boolean;
  roundTripOk: boolean;
  regen: string;
  project: BlocksProject;
}

function checkTranslation(source: string, title: string, settings: BlocksProject["settings"]): TranslationCheck {
  const project = blocksProjectFromPython(source, title, settings);
  const { main } = pythonToBlocks(source);
  const hasRaw = hasRawBlock(main);
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(project.workspace as object, ws);
    const regen = workspaceToPython(ws);
    const roundTripOk = normalizePython(regen) === normalizePython(source);
    return { hasRaw, roundTripOk, regen, project };
  } finally {
    ws.dispose();
  }
}

interface PromptState {
  hasRaw: boolean;
  roundTripOk: boolean;
}

interface ToPythonPromptState {
  hasRaw: boolean;
  roundTripOk: boolean;
  source: string;
}

export function Header({ onOpenSettings }: Props) {
  const { project, setProject } = useApp();
  const loadProject = useApp((s) => s.loadProject);
  const markSaved = useApp((s) => s.markSaved);
  const [switchPrompt, setSwitchPrompt] = useState<PromptState | null>(null);
  const [toPythonPrompt, setToPythonPrompt] = useState<ToPythonPromptState | null>(null);
  const dark = project.type === "python";

  const rename = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProject({ ...project, title: e.target.value });
  };

  const toggleType = () => {
    if (project.type === "blocks") {
      const source = useApp.getState().pythonPreview || "";
      // Warn if the generated Python can't be parsed back to matching blocks —
      // going back after edits will lose fidelity.
      const check = checkTranslation(source, project.title, project.settings);
      if (check.hasRaw || !check.roundTripOk) {
        setToPythonPrompt({ hasRaw: check.hasRaw, roundTripOk: check.roundTripOk, source });
        return;
      }
      setProject({ ...newPythonProject(project.title), settings: project.settings, source });
      return;
    }
    const check = checkTranslation(project.source, project.title, project.settings);
    if (!check.hasRaw && check.roundTripOk) {
      // Clean translation — skip prompt.
      setProject(check.project);
      return;
    }
    setSwitchPrompt({ hasRaw: check.hasRaw, roundTripOk: check.roundTripOk });
  };

  const confirmToPython = () => {
    if (!toPythonPrompt) return;
    setProject({ ...newPythonProject(project.title), settings: project.settings, source: toPythonPrompt.source });
    setToPythonPrompt(null);
  };

  const confirmSwitch = (mode: "best-effort" | "discard") => {
    if (project.type !== "python") return setSwitchPrompt(null);
    if (mode === "best-effort") {
      setProject(blocksProjectFromPython(project.source, project.title, project.settings));
    } else {
      setProject({ ...newBlocksProject(project.title), settings: project.settings });
    }
    setSwitchPrompt(null);
  };

  const openFile = async () => {
    const file = await pickFile(".json,.blocksproj.json,.py");
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith(".py")) {
      loadProject({
        ...newPythonProject(file.name.replace(/\.py$/, "")),
        source: text,
      });
    } else {
      try {
        const raw = JSON.parse(text);
        const parsed = parseProject(raw);
        if (!parsed) {
          alert("Unsupported project format. Only b2op-hub-blocks projects are supported.");
          return;
        }
        if (parsed.stale) {
          alert("This project was created with an older version. It may not work correctly. Please recreate it using the current blocks.");
        }
        loadProject(parsed.project);
      } catch (e) {
        alert("Invalid project file: " + (e as Error).message);
      }
    }
  };

  const saveFile = () => {
    downloadProject(project);
    markSaved();
  };

  const toggleAdvanced = () => {
    useApp.getState().updateSettings({ showAdvanced: !project.settings.showAdvanced });
  };

  const headerBg = dark ? "#0b1216" : "#0e7490";
  const headerBorder = dark ? "#164e63" : "#155e75";
  const inputBg = dark ? "#111a20" : "#ffffff";
  const inputColor = dark ? "#dff5fb" : "#0b3b48";
  const inputBorder = dark ? "#164e63" : "#b6dbe4";

  const btnStyle: React.CSSProperties = {
    padding: "4px 12px",
    border: dark ? "1px solid #164e63" : "1px solid rgba(255,255,255,0.4)",
    background: dark ? "#111a20" : "rgba(255,255,255,0.12)",
    color: "#ffffff",
    cursor: "pointer",
    borderRadius: 6,
    fontWeight: 600,
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        background: headerBg,
        color: "#ffffff",
        borderBottom: `1px solid ${headerBorder}`,
      }}
    >
      <strong style={{ letterSpacing: 0.4 }}>b2op-hub-blocks</strong>
      <input
        value={project.title}
        onChange={rename}
        style={{
          background: inputBg,
          color: inputColor,
          border: `1px solid ${inputBorder}`,
          padding: "4px 8px",
          borderRadius: 6,
          width: 220,
          outline: "none",
        }}
        aria-label="project title"
      />
      <button type="button" onClick={toggleType} style={btnStyle}>
        Mode: {project.type === "blocks" ? "Blocks" : "Python"}
      </button>
      {project.type === "blocks" && (
        <button type="button" onClick={toggleAdvanced} style={btnStyle}>
          {project.settings.showAdvanced ? "Advanced ✓" : "Advanced"}
        </button>
      )}
      <button type="button" onClick={openFile} style={btnStyle}>Open</button>
      <button type="button" onClick={saveFile} style={btnStyle}>Save</button>
      <button type="button" onClick={onOpenSettings} style={{ ...btnStyle, marginLeft: "auto" }}>Settings</button>
      {switchPrompt && (
        <SwitchToBlocksPrompt
          dark={dark}
          state={switchPrompt}
          onCancel={() => setSwitchPrompt(null)}
          onDiscard={() => confirmSwitch("discard")}
          onBestEffort={() => confirmSwitch("best-effort")}
        />
      )}
      {toPythonPrompt && (
        <SwitchToPythonPrompt
          dark={dark}
          state={toPythonPrompt}
          onCancel={() => setToPythonPrompt(null)}
          onProceed={confirmToPython}
        />
      )}
    </header>
  );
}

interface PromptProps {
  dark: boolean;
  state: PromptState;
  onCancel: () => void;
  onDiscard: () => void;
  onBestEffort: () => void;
}

function SwitchToBlocksPrompt({ dark, state, onCancel, onDiscard, onBestEffort }: PromptProps) {
  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: dark ? "rgba(0,0,0,0.6)" : "rgba(11, 59, 72, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const modal: React.CSSProperties = {
    background: dark ? "#0b1216" : "#ffffff",
    color: dark ? "#dff5fb" : "#0b3b48",
    padding: 20,
    borderRadius: 12,
    maxWidth: 460,
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,111,143,0.25)",
  };
  const btn: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid #155e75",
  };
  const warnBg = dark ? "#3f1d1d" : "#fef2f2";
  const warnBorder = dark ? "#7f1d1d" : "#fecaca";
  const warnColor = dark ? "#fecaca" : "#7f1d1d";
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Switch to Blocks?</h3>
        <p style={{ fontSize: 14, lineHeight: 1.4 }}>
          Full translation isn't possible for this Python source:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.5, paddingLeft: 18 }}>
          {state.hasRaw && (
            <li>Some code doesn't map to any block — it will stay inside "raw Python" blocks.</li>
          )}
          {!state.roundTripOk && (
            <li style={{
              background: warnBg,
              border: `1px solid ${warnBorder}`,
              color: warnColor,
              padding: "4px 8px",
              borderRadius: 4,
              listStyle: "none",
              marginLeft: -18,
            }}>
              <strong>Round-trip check failed:</strong> regenerating Python from the imported blocks does not reproduce the original source exactly. Behavior may drift.
            </li>
          )}
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>Choose how to proceed:</p>
        <ul style={{ fontSize: 13, lineHeight: 1.5, paddingLeft: 18 }}>
          <li><strong>Best effort</strong> — keep whatever translated + raw Python for the rest.</li>
          <li><strong>Discard</strong> — start with an empty blocks workspace.</li>
          <li><strong>Cancel</strong> — stay in Python mode.</li>
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel} style={{ ...btn, background: "transparent", color: dark ? "#dff5fb" : "#0b3b48", border: `1px solid ${dark ? "#164e63" : "#b6dbe4"}` }}>
            Cancel
          </button>
          <button type="button" onClick={onDiscard} style={{ ...btn, background: "#b91c1c", color: "#fff", border: "1px solid #7f1d1d" }}>
            Discard
          </button>
          <button type="button" onClick={onBestEffort} style={{ ...btn, background: "#0e7490", color: "#fff" }}>
            Best effort
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToPythonPromptProps {
  dark: boolean;
  state: ToPythonPromptState;
  onCancel: () => void;
  onProceed: () => void;
}

function SwitchToPythonPrompt({ dark, state, onCancel, onProceed }: ToPythonPromptProps) {
  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: dark ? "rgba(0,0,0,0.6)" : "rgba(11, 59, 72, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const modal: React.CSSProperties = {
    background: dark ? "#0b1216" : "#ffffff",
    color: dark ? "#dff5fb" : "#0b3b48",
    padding: 20,
    borderRadius: 12,
    maxWidth: 460,
    border: dark ? "1px solid #164e63" : "1px solid #b6dbe4",
    boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,111,143,0.25)",
  };
  const btn: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid #155e75",
  };
  const warnBg = dark ? "#3f1d1d" : "#fef2f2";
  const warnBorder = dark ? "#7f1d1d" : "#fecaca";
  const warnColor = dark ? "#fecaca" : "#7f1d1d";
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Switch to Python?</h3>
        <div style={{
          background: warnBg,
          border: `1px solid ${warnBorder}`,
          color: warnColor,
          padding: "8px 10px",
          borderRadius: 6,
          fontSize: 13,
          lineHeight: 1.5,
          marginBottom: 12,
        }}>
          <strong>Going back to Blocks won't be lossless.</strong> The generated
          Python does not round-trip cleanly to the current blocks:
          <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
            {state.hasRaw && (
              <li>Contains constructs that only exist as "raw Python" blocks.</li>
            )}
            {!state.roundTripOk && (
              <li>Re-parsing the Python does not reproduce the current workspace exactly.</li>
            )}
          </ul>
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            If you edit the Python and later switch back, some blocks may change
            or disappear.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...btn, background: "transparent", color: dark ? "#dff5fb" : "#0b3b48", border: `1px solid ${dark ? "#164e63" : "#b6dbe4"}` }}>
            Cancel
          </button>
          <button type="button" onClick={onProceed} style={{ ...btn, background: "#0e7490", color: "#fff" }}>
            Switch anyway
          </button>
        </div>
      </div>
    </div>
  );
}
