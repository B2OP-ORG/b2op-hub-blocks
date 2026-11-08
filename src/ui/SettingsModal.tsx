import { useState } from "react";
import { useApp } from "../state/store";
import {
  DEFAULT_EDITOR_SETTINGS, DEFAULT_MONACO_SETTINGS, DEFAULT_SIDEBAR_SETTINGS, SIDEBAR_TAB_IDS,
  type LspMode, type MonacoSettings,
} from "../project/format";
import { DEFAULT_SIDEBAR_WIDTH } from "../project/storage";
import { usePalette, type Palette } from "./theme";
import { buttonStyle } from "./Dialog";

interface Props {
  onClose: () => void;
}

type Section = "general" | "sidebar" | "blocks" | "code" | "lsp" | "device";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "sidebar", label: "Sidebar" },
  { id: "blocks", label: "Blocks editor" },
  { id: "code", label: "Code editor" },
  { id: "lsp", label: "Python language server" },
  { id: "device", label: "Device & uploads" },
];

const TAB_LABELS: Record<string, string> = { explorer: "Explorer", projects: "Projects", sdcard: "SD card", device: "Device" };

const FONT_PRESETS: { label: string; value: string }[] = [
  { label: "Default monospace", value: "" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "Cascadia Code", value: "'Cascadia Code', monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const FW_KEY = "b2op.suppressFwUpdates";

// ── Field primitives ───────────────────────────────────────────────────────────

function Row({ p, label, help, children }: { p: Palette; label: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(160px, 1.2fr)", gap: "4px 14px", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${p.dark ? "#10303c" : "#e3f1f5"}` }}>
      <div>
        <div style={{ fontSize: 13 }}>{label}</div>
        {help && <div style={{ fontSize: 11, color: p.dimText, marginTop: 2, lineHeight: 1.4 }}>{help}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      {checked ? "On" : "Off"}
    </label>
  );
}

function Select<T extends string>({ p, value, options, onChange }: { p: Palette; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{ background: p.inputBg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 13, maxWidth: "100%" }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function NumberInput({ p, value, min, max, step = 1, onChange, suffix }: { p: Palette; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const commit = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      setText(String(clamped));
    } else {
      setText(String(value));
    }
  };
  return (
    <>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n); }}
        onBlur={(e) => commit(e.target.value)}
        style={{ width: 72, background: p.inputBg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 13 }}
      />
      {suffix && <span style={{ fontSize: 12, color: p.dimText }}>{suffix}</span>}
    </>
  );
}

function GroupTitle({ p, children, onReset }: { p: Palette; children: React.ReactNode; onReset?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "16px 0 2px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: p.dimText, flex: 1 }}>{children}</div>
      {onReset && (
        <button type="button" onClick={onReset} style={{ background: "none", border: "none", color: p.accent, cursor: "pointer", fontSize: 12, padding: 0 }}>
          Reset to defaults
        </button>
      )}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

export function SettingsModal({ onClose }: Props) {
  const settings = useApp((s) => s.editorSettings);
  const update = useApp((s) => s.updateEditorSettings);
  const setSidebarWidth = useApp((s) => s.setSidebarWidth);
  const p = usePalette();
  const [section, setSection] = useState<Section>("general");
  const [fwNotifs, setFwNotifs] = useState(() => {
    try { return localStorage.getItem(FW_KEY) !== "true"; } catch { return true; }
  });

  const m = settings.monaco;
  const setM = (patch: Partial<MonacoSettings>) => update({ monaco: { ...m, ...patch } });
  const sb = settings.sidebar;
  const presetMatch = FONT_PRESETS.find((f) => f.value === m.fontFamily);

  const body = (() => {
    switch (section) {
      case "general":
        return (
          <>
            <GroupTitle p={p}>Appearance</GroupTitle>
            <Row p={p} label="Dark mode" help="Applies to the whole app, including the code editor.">
              <Toggle label="Dark mode" checked={settings.darkMode} onChange={(v) => update({ darkMode: v })} />
            </Row>
            <GroupTitle p={p}>Notifications</GroupTitle>
            <Row p={p} label="Firmware update notifications" help="Prompt when the connected hub runs older firmware than the latest release.">
              <Toggle
                label="Firmware update notifications"
                checked={fwNotifs}
                onChange={(v) => {
                  setFwNotifs(v);
                  try { if (v) localStorage.removeItem(FW_KEY); else localStorage.setItem(FW_KEY, "true"); } catch { /* ignore */ }
                }}
              />
            </Row>
          </>
        );
      case "sidebar":
        return (
          <>
            <GroupTitle p={p} onReset={() => { update({ sidebar: DEFAULT_SIDEBAR_SETTINGS }); setSidebarWidth(DEFAULT_SIDEBAR_WIDTH); }}>Layout</GroupTitle>
            <Row p={p} label="Position">
              <Select p={p} value={sb.side} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} onChange={(v) => update({ sidebar: { ...sb, side: v } })} />
            </Row>
            <Row p={p} label="Width" help="You can also drag the sidebar's edge; double-click it to reset.">
              <button type="button" style={buttonStyle(p)} onClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}>Reset width</button>
            </Row>
            <GroupTitle p={p}>Visible tabs</GroupTitle>
            {SIDEBAR_TAB_IDS.map((t) => {
              const shown = !sb.hiddenTabs.includes(t);
              const lastShown = shown && SIDEBAR_TAB_IDS.filter((x) => !sb.hiddenTabs.includes(x)).length === 1;
              return (
                <Row key={t} p={p} label={TAB_LABELS[t]} help={lastShown ? "At least one tab must stay visible." : undefined}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: lastShown ? "default" : "pointer" }}>
                    <input
                      type="checkbox"
                      checked={shown}
                      disabled={lastShown}
                      onChange={(e) => update({ sidebar: { ...sb, hiddenTabs: e.target.checked ? sb.hiddenTabs.filter((x) => x !== t) : [...sb.hiddenTabs, t] } })}
                    />
                    {shown ? "Shown" : "Hidden"}
                  </label>
                </Row>
              );
            })}
            <div style={{ fontSize: 11, color: p.dimText, marginTop: 8 }}>Right-click the sidebar's icon strip to reorder tabs.</div>
          </>
        );
      case "blocks":
        return (
          <>
            <GroupTitle p={p} onReset={() => update({ showAdvanced: DEFAULT_EDITOR_SETTINGS.showAdvanced, toolboxBlockScale: DEFAULT_EDITOR_SETTINGS.toolboxBlockScale })}>Toolbox</GroupTitle>
            <Row p={p} label="Show advanced blocks" help="Adds low-level hub and motor blocks to the toolbox.">
              <Toggle label="Show advanced blocks" checked={settings.showAdvanced} onChange={(v) => update({ showAdvanced: v })} />
            </Row>
            <Row p={p} label="Toolbox block size">
              <input type="range" min={0.5} max={1.5} step={0.05} value={settings.toolboxBlockScale} onChange={(e) => update({ toolboxBlockScale: Number(e.target.value) })} style={{ flex: 1, minWidth: 0 }} />
              <span style={{ width: 44, textAlign: "right", fontSize: 12 }}>{settings.toolboxBlockScale.toFixed(2)}×</span>
            </Row>
          </>
        );
      case "code":
        return (
          <>
            <GroupTitle p={p} onReset={() => update({ monaco: DEFAULT_MONACO_SETTINGS })}>Font</GroupTitle>
            <Row p={p} label="Font size"><NumberInput p={p} value={m.fontSize} min={8} max={32} onChange={(v) => setM({ fontSize: v })} suffix="px" /></Row>
            <Row p={p} label="Font family" help="The font must be installed on this computer.">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                <Select
                  p={p}
                  value={presetMatch ? presetMatch.value : "__custom"}
                  options={[...FONT_PRESETS, { label: "Custom…", value: "__custom" }]}
                  onChange={(v) => setM({ fontFamily: v === "__custom" ? (m.fontFamily || "monospace") : v })}
                />
                {!presetMatch && (
                  <input
                    value={m.fontFamily}
                    onChange={(e) => setM({ fontFamily: e.target.value })}
                    placeholder="'My Font', monospace"
                    style={{ background: p.inputBg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 13 }}
                  />
                )}
              </div>
            </Row>
            <Row p={p} label="Font ligatures" help="Combine sequences like -> or != into one glyph (font must support it)."><Toggle label="Font ligatures" checked={m.fontLigatures} onChange={(v) => setM({ fontLigatures: v })} /></Row>
            <Row p={p} label="Line height" help="0 = automatic."><NumberInput p={p} value={m.lineHeight} min={0} max={60} onChange={(v) => setM({ lineHeight: v })} suffix="px" /></Row>

            <GroupTitle p={p}>Indentation</GroupTitle>
            <Row p={p} label="Tab size"><Select p={p} value={String(m.tabSize)} options={["2", "4", "8"].map((v) => ({ value: v, label: `${v} spaces` }))} onChange={(v) => setM({ tabSize: Number(v) })} /></Row>
            <Row p={p} label="Indent with spaces" help="Off = insert tab characters."><Toggle label="Indent with spaces" checked={m.insertSpaces} onChange={(v) => setM({ insertSpaces: v })} /></Row>
            <Row p={p} label="Detect indentation from file" help="Overrides the two settings above, based on the file's content."><Toggle label="Detect indentation" checked={m.detectIndentation} onChange={(v) => setM({ detectIndentation: v })} /></Row>

            <GroupTitle p={p}>Display</GroupTitle>
            <Row p={p} label="Word wrap">
              <Select p={p} value={m.wordWrap} options={[{ value: "off", label: "Off" }, { value: "on", label: "At window edge" }, { value: "wordWrapColumn", label: "At column" }, { value: "bounded", label: "At column or edge" }]} onChange={(v) => setM({ wordWrap: v })} />
            </Row>
            {(m.wordWrap === "wordWrapColumn" || m.wordWrap === "bounded") && (
              <Row p={p} label="Wrap column"><NumberInput p={p} value={m.wordWrapColumn} min={20} max={300} onChange={(v) => setM({ wordWrapColumn: v })} /></Row>
            )}
            <Row p={p} label="Line numbers"><Select p={p} value={m.lineNumbers} options={[{ value: "on", label: "On" }, { value: "relative", label: "Relative" }, { value: "off", label: "Off" }]} onChange={(v) => setM({ lineNumbers: v })} /></Row>
            <Row p={p} label="Minimap"><Toggle label="Minimap" checked={m.minimap} onChange={(v) => setM({ minimap: v })} /></Row>
            {m.minimap && <Row p={p} label="Minimap side"><Select p={p} value={m.minimapSide} options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} onChange={(v) => setM({ minimapSide: v })} /></Row>}
            <Row p={p} label="Show whitespace">
              <Select p={p} value={m.renderWhitespace} options={[{ value: "none", label: "Never" }, { value: "selection", label: "In selection" }, { value: "boundary", label: "Except single spaces" }, { value: "trailing", label: "Trailing only" }, { value: "all", label: "Always" }]} onChange={(v) => setM({ renderWhitespace: v })} />
            </Row>
            <Row p={p} label="Highlight current line">
              <Select p={p} value={m.renderLineHighlight} options={[{ value: "line", label: "Line" }, { value: "gutter", label: "Gutter" }, { value: "all", label: "Line and gutter" }, { value: "none", label: "Off" }]} onChange={(v) => setM({ renderLineHighlight: v })} />
            </Row>
            <Row p={p} label="Sticky scroll" help="Keep the enclosing def/class/loop header visible while scrolling."><Toggle label="Sticky scroll" checked={m.stickyScroll} onChange={(v) => setM({ stickyScroll: v })} /></Row>
            <Row p={p} label="Code folding"><Toggle label="Code folding" checked={m.folding} onChange={(v) => setM({ folding: v })} /></Row>
            <Row p={p} label="Bracket pair colours"><Toggle label="Bracket pair colours" checked={m.bracketPairColorization} onChange={(v) => setM({ bracketPairColorization: v })} /></Row>
            <Row p={p} label="Bracket pair guides"><Toggle label="Bracket pair guides" checked={m.bracketPairGuides} onChange={(v) => setM({ bracketPairGuides: v })} /></Row>
            <Row p={p} label="Indentation guides"><Toggle label="Indentation guides" checked={m.indentationGuides} onChange={(v) => setM({ indentationGuides: v })} /></Row>

            <GroupTitle p={p}>Cursor & scrolling</GroupTitle>
            <Row p={p} label="Cursor style">
              <Select p={p} value={m.cursorStyle} options={[{ value: "line", label: "Line" }, { value: "line-thin", label: "Thin line" }, { value: "block", label: "Block" }, { value: "block-outline", label: "Block outline" }, { value: "underline", label: "Underline" }, { value: "underline-thin", label: "Thin underline" }]} onChange={(v) => setM({ cursorStyle: v })} />
            </Row>
            <Row p={p} label="Cursor blinking">
              <Select p={p} value={m.cursorBlinking} options={[{ value: "blink", label: "Blink" }, { value: "smooth", label: "Smooth" }, { value: "phase", label: "Phase" }, { value: "expand", label: "Expand" }, { value: "solid", label: "Solid (no blink)" }]} onChange={(v) => setM({ cursorBlinking: v })} />
            </Row>
            <Row p={p} label="Smooth cursor animation">
              <Select p={p} value={m.cursorSmoothCaretAnimation} options={[{ value: "off", label: "Off" }, { value: "explicit", label: "Only on explicit moves" }, { value: "on", label: "Always" }]} onChange={(v) => setM({ cursorSmoothCaretAnimation: v })} />
            </Row>
            <Row p={p} label="Smooth scrolling"><Toggle label="Smooth scrolling" checked={m.smoothScrolling} onChange={(v) => setM({ smoothScrolling: v })} /></Row>
            <Row p={p} label="Scroll past last line"><Toggle label="Scroll past last line" checked={m.scrollBeyondLastLine} onChange={(v) => setM({ scrollBeyondLastLine: v })} /></Row>
            <Row p={p} label="Zoom with Ctrl + mouse wheel"><Toggle label="Mouse wheel zoom" checked={m.mouseWheelZoom} onChange={(v) => setM({ mouseWheelZoom: v })} /></Row>

            <GroupTitle p={p}>Editing</GroupTitle>
            <Row p={p} label="Auto-close brackets">
              <Select p={p} value={m.autoClosingBrackets} options={[{ value: "languageDefined", label: "Language default" }, { value: "always", label: "Always" }, { value: "beforeWhitespace", label: "Before whitespace" }, { value: "never", label: "Never" }]} onChange={(v) => setM({ autoClosingBrackets: v })} />
            </Row>
            <Row p={p} label="Auto-close quotes">
              <Select p={p} value={m.autoClosingQuotes} options={[{ value: "languageDefined", label: "Language default" }, { value: "always", label: "Always" }, { value: "beforeWhitespace", label: "Before whitespace" }, { value: "never", label: "Never" }]} onChange={(v) => setM({ autoClosingQuotes: v })} />
            </Row>

            <GroupTitle p={p}>Suggestions</GroupTitle>
            <Row p={p} label="Suggest while typing" help="Show completions automatically. Ctrl+Space always works."><Toggle label="Suggest while typing" checked={m.quickSuggestions} onChange={(v) => setM({ quickSuggestions: v })} /></Row>
            <Row p={p} label="Preview suggestion inline"><Toggle label="Preview suggestion inline" checked={m.suggestPreview} onChange={(v) => setM({ suggestPreview: v })} /></Row>
            <Row p={p} label="Accept suggestion with Enter" help="Tab always accepts. 'Smart' only accepts on Enter when it changes the text.">
              <Select p={p} value={m.acceptSuggestionOnEnter} options={[{ value: "on", label: "On" }, { value: "smart", label: "Smart" }, { value: "off", label: "Off" }]} onChange={(v) => setM({ acceptSuggestionOnEnter: v })} />
            </Row>
            <Row p={p} label="Parameter hints" help="Show the function signature while typing arguments."><Toggle label="Parameter hints" checked={m.parameterHints} onChange={(v) => setM({ parameterHints: v })} /></Row>
          </>
        );
      case "lsp":
        return (
          <>
            <GroupTitle p={p} onReset={() => update({ lspMode: DEFAULT_EDITOR_SETTINGS.lspMode, lspRemoteUrl: DEFAULT_EDITOR_SETTINGS.lspRemoteUrl })}>Language server</GroupTitle>
            <Row p={p} label="Mode" help="Provides completion, hover info, signature help and error checking in the Python editor.">
              <Select<LspMode> p={p} value={settings.lspMode} options={[{ value: "worker", label: "In the browser (Pyright)" }, { value: "remote", label: "Remote server (WebSocket)" }, { value: "off", label: "Off" }]} onChange={(v) => update({ lspMode: v })} />
            </Row>
            {settings.lspMode === "remote" && (
              <Row p={p} label="Server URL" help={<>Run the server from <code>docs/lsp-server/</code>.</>}>
                <input
                  type="text"
                  value={settings.lspRemoteUrl}
                  onChange={(e) => update({ lspRemoteUrl: e.target.value })}
                  style={{ flex: 1, minWidth: 0, background: p.inputBg, color: p.text, border: `1px solid ${p.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 13 }}
                />
              </Row>
            )}
          </>
        );
      case "device":
        return (
          <>
            <GroupTitle p={p}>Uploads</GroupTitle>
            <div style={{ fontSize: 12, color: p.dimText, lineHeight: 1.5, padding: "6px 0" }}>
              Projects upload to <code>/sd/&lt;project-name&gt;/</code> on the hub. Upload and Run only send files that changed since the last upload
              (right-click Upload for "Upload all"). Run starts the project's <code>main.py</code>.
            </div>
            <GroupTitle p={p}>File system access</GroupTitle>
            <Row p={p} label="Allow access outside /sd/" help={<>Lets the SD card tab browse and upload to <code>/</code>. <code>/main.py</code>, <code>/boot.py</code>, <code>/boot.mpy</code> and <code>/runner.py</code> are always protected.</>}>
              <Toggle label="Allow root filesystem access" checked={settings.allowRoot} onChange={(v) => update({ allowRoot: v })} />
            </Row>
          </>
        );
    }
  })();

  return (
    <div
      style={{ position: "fixed", inset: 0, background: p.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        role="dialog"
        aria-label="Settings"
        style={{
          background: p.surface,
          color: p.text,
          borderRadius: 12,
          width: "min(820px, 96vw)",
          height: "min(640px, 92vh)",
          border: `1px solid ${p.border}`,
          boxShadow: p.shadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${p.border}` }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 17 }}>Settings</h3>
          <button type="button" onClick={onClose} style={buttonStyle(p, "primary")}>Done</button>
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <nav style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${p.border}`, padding: "8px 0", overflowY: "auto", background: p.dark ? "#0a1014" : "#f3f9fb" }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 16px",
                  background: section === s.id ? p.activeBg : "none",
                  border: "none",
                  borderLeft: `3px solid ${section === s.id ? p.accent : "transparent"}`,
                  color: p.text,
                  fontWeight: section === s.id ? 700 : 400,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", minWidth: 0 }}>
            <h4 style={{ margin: "16px 0 0", fontSize: 15 }}>{SECTIONS.find((s) => s.id === section)?.label}</h4>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
