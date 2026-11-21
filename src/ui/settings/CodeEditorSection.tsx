import { useApp } from "../../state/store";
import { DEFAULT_MONACO_SETTINGS, type MonacoSettings } from "../../settings/editorSettings";
import { FONT_PRESETS } from "./constants";
import { GroupTitle, NumberInput, Row, Select, TextInput, Toggle } from "./settingsFields";

/** Monaco options: font, indentation, display, cursor, editing, suggestions. */
export function CodeEditorSection() {
  const m = useApp((s) => s.editorSettings.monaco);
  const update = useApp((s) => s.updateEditorSettings);
  const setM = (patch: Partial<MonacoSettings>) => update({ monaco: { ...m, ...patch } });
  const presetMatch = FONT_PRESETS.find((f) => f.value === m.fontFamily);
  return (
    <>
      <GroupTitle onReset={() => update({ monaco: DEFAULT_MONACO_SETTINGS })}>Font</GroupTitle>
      <Row label="Font size"><NumberInput value={m.fontSize} min={8} max={32} onChange={(v) => setM({ fontSize: v })} suffix="px" /></Row>
      <Row label="Font family" help="The font must be installed on this computer.">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          <Select
            value={presetMatch ? presetMatch.value : "__custom"}
            options={[...FONT_PRESETS, { label: "Custom…", value: "__custom" }]}
            onChange={(v) => setM({ fontFamily: v === "__custom" ? (m.fontFamily || "monospace") : v })}
          />
          {!presetMatch && <TextInput value={m.fontFamily} onChange={(v) => setM({ fontFamily: v })} placeholder="'My Font', monospace" />}
        </div>
      </Row>
      <Row label="Font ligatures" help="Combine sequences like -> or != into one glyph (font must support it)."><Toggle label="Font ligatures" checked={m.fontLigatures} onChange={(v) => setM({ fontLigatures: v })} /></Row>
      <Row label="Line height" help="0 = automatic."><NumberInput value={m.lineHeight} min={0} max={60} onChange={(v) => setM({ lineHeight: v })} suffix="px" /></Row>

      <GroupTitle>Indentation</GroupTitle>
      <Row label="Tab size"><Select value={String(m.tabSize)} options={["2", "4", "8"].map((v) => ({ value: v, label: `${v} spaces` }))} onChange={(v) => setM({ tabSize: Number(v) })} /></Row>
      <Row label="Indent with spaces" help="Off = insert tab characters."><Toggle label="Indent with spaces" checked={m.insertSpaces} onChange={(v) => setM({ insertSpaces: v })} /></Row>
      <Row label="Detect indentation from file" help="Overrides the two settings above, based on the file's content."><Toggle label="Detect indentation" checked={m.detectIndentation} onChange={(v) => setM({ detectIndentation: v })} /></Row>

      <GroupTitle>Display</GroupTitle>
      <Row label="Word wrap">
        <Select value={m.wordWrap} options={[{ value: "off", label: "Off" }, { value: "on", label: "At window edge" }, { value: "wordWrapColumn", label: "At column" }, { value: "bounded", label: "At column or edge" }]} onChange={(v) => setM({ wordWrap: v })} />
      </Row>
      {(m.wordWrap === "wordWrapColumn" || m.wordWrap === "bounded") && (
        <Row label="Wrap column"><NumberInput value={m.wordWrapColumn} min={20} max={300} onChange={(v) => setM({ wordWrapColumn: v })} /></Row>
      )}
      <Row label="Line numbers"><Select value={m.lineNumbers} options={[{ value: "on", label: "On" }, { value: "relative", label: "Relative" }, { value: "off", label: "Off" }]} onChange={(v) => setM({ lineNumbers: v })} /></Row>
      <Row label="Minimap"><Toggle label="Minimap" checked={m.minimap} onChange={(v) => setM({ minimap: v })} /></Row>
      {m.minimap && <Row label="Minimap side"><Select value={m.minimapSide} options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} onChange={(v) => setM({ minimapSide: v })} /></Row>}
      <Row label="Show whitespace">
        <Select value={m.renderWhitespace} options={[{ value: "none", label: "Never" }, { value: "selection", label: "In selection" }, { value: "boundary", label: "Except single spaces" }, { value: "trailing", label: "Trailing only" }, { value: "all", label: "Always" }]} onChange={(v) => setM({ renderWhitespace: v })} />
      </Row>
      <Row label="Highlight current line">
        <Select value={m.renderLineHighlight} options={[{ value: "line", label: "Line" }, { value: "gutter", label: "Gutter" }, { value: "all", label: "Line and gutter" }, { value: "none", label: "Off" }]} onChange={(v) => setM({ renderLineHighlight: v })} />
      </Row>
      <Row label="Sticky scroll" help="Keep the enclosing def/class/loop header visible while scrolling."><Toggle label="Sticky scroll" checked={m.stickyScroll} onChange={(v) => setM({ stickyScroll: v })} /></Row>
      <Row label="Code folding"><Toggle label="Code folding" checked={m.folding} onChange={(v) => setM({ folding: v })} /></Row>
      <Row label="Bracket pair colours"><Toggle label="Bracket pair colours" checked={m.bracketPairColorization} onChange={(v) => setM({ bracketPairColorization: v })} /></Row>
      <Row label="Bracket pair guides"><Toggle label="Bracket pair guides" checked={m.bracketPairGuides} onChange={(v) => setM({ bracketPairGuides: v })} /></Row>
      <Row label="Indentation guides"><Toggle label="Indentation guides" checked={m.indentationGuides} onChange={(v) => setM({ indentationGuides: v })} /></Row>

      <GroupTitle>Cursor & scrolling</GroupTitle>
      <Row label="Cursor style">
        <Select value={m.cursorStyle} options={[{ value: "line", label: "Line" }, { value: "line-thin", label: "Thin line" }, { value: "block", label: "Block" }, { value: "block-outline", label: "Block outline" }, { value: "underline", label: "Underline" }, { value: "underline-thin", label: "Thin underline" }]} onChange={(v) => setM({ cursorStyle: v })} />
      </Row>
      <Row label="Cursor blinking">
        <Select value={m.cursorBlinking} options={[{ value: "blink", label: "Blink" }, { value: "smooth", label: "Smooth" }, { value: "phase", label: "Phase" }, { value: "expand", label: "Expand" }, { value: "solid", label: "Solid (no blink)" }]} onChange={(v) => setM({ cursorBlinking: v })} />
      </Row>
      <Row label="Smooth cursor animation">
        <Select value={m.cursorSmoothCaretAnimation} options={[{ value: "off", label: "Off" }, { value: "explicit", label: "Only on explicit moves" }, { value: "on", label: "Always" }]} onChange={(v) => setM({ cursorSmoothCaretAnimation: v })} />
      </Row>
      <Row label="Smooth scrolling"><Toggle label="Smooth scrolling" checked={m.smoothScrolling} onChange={(v) => setM({ smoothScrolling: v })} /></Row>
      <Row label="Scroll past last line"><Toggle label="Scroll past last line" checked={m.scrollBeyondLastLine} onChange={(v) => setM({ scrollBeyondLastLine: v })} /></Row>
      <Row label="Zoom with Ctrl + mouse wheel"><Toggle label="Mouse wheel zoom" checked={m.mouseWheelZoom} onChange={(v) => setM({ mouseWheelZoom: v })} /></Row>

      <GroupTitle>Editing</GroupTitle>
      <Row label="Auto-close brackets">
        <Select value={m.autoClosingBrackets} options={[{ value: "languageDefined", label: "Language default" }, { value: "always", label: "Always" }, { value: "beforeWhitespace", label: "Before whitespace" }, { value: "never", label: "Never" }]} onChange={(v) => setM({ autoClosingBrackets: v })} />
      </Row>
      <Row label="Auto-close quotes">
        <Select value={m.autoClosingQuotes} options={[{ value: "languageDefined", label: "Language default" }, { value: "always", label: "Always" }, { value: "beforeWhitespace", label: "Before whitespace" }, { value: "never", label: "Never" }]} onChange={(v) => setM({ autoClosingQuotes: v })} />
      </Row>

      <GroupTitle>Suggestions</GroupTitle>
      <Row label="Suggest while typing" help="Show completions automatically. Ctrl+Space always works."><Toggle label="Suggest while typing" checked={m.quickSuggestions} onChange={(v) => setM({ quickSuggestions: v })} /></Row>
      <Row label="Preview suggestion inline"><Toggle label="Preview suggestion inline" checked={m.suggestPreview} onChange={(v) => setM({ suggestPreview: v })} /></Row>
      <Row label="Accept suggestion with Enter" help="Tab always accepts. 'Smart' only accepts on Enter when it changes the text.">
        <Select value={m.acceptSuggestionOnEnter} options={[{ value: "on", label: "On" }, { value: "smart", label: "Smart" }, { value: "off", label: "Off" }]} onChange={(v) => setM({ acceptSuggestionOnEnter: v })} />
      </Row>
      <Row label="Parameter hints" help="Show the function signature while typing arguments."><Toggle label="Parameter hints" checked={m.parameterHints} onChange={(v) => setM({ parameterHints: v })} /></Row>
    </>
  );
}
