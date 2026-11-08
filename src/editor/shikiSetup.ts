// Syntax highlighting via Shiki: VS Code's TextMate Python grammar and the
// Dark+ theme, bridged into Monaco by @shikijs/monaco. Uses the JavaScript
// regex engine so no Oniguruma WASM is shipped.
//
// On top of that, the LSP (basedpyright) supplies semantic tokens — module
// names, classes, parameters, etc. that a TextMate grammar can't know about.
// This file also extends the Monaco theme so those semantic token types get
// the same colours VS Code would give them.

import type * as monaco from "monaco-editor";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { shikiToMonaco, textmateThemeToMonacoTheme } from "@shikijs/monaco";

export const EDITOR_THEME = "dark-plus";

/**
 * Semantic token type (or `type.modifier`) → TextMate scopes, in priority
 * order. Mirrors VS Code's default semantic-token → scope mapping, so colours
 * are resolved from the active theme rather than hard-coded.
 *
 * Only types listed here are styled. Monaco standalone resets unmapped types
 * to the default foreground, so the LSP client drops every other token type
 * and lets the TextMate colour show through.
 */
const SEMANTIC_SCOPES: Record<string, string[]> = {
  namespace: ["entity.name.namespace"],
  type: ["entity.name.type", "support.type"],
  class: ["entity.name.type.class", "support.class"],
  enum: ["entity.name.type.enum"],
  typeParameter: ["entity.name.type.parameter"],
  parameter: ["variable.parameter"],
  selfParameter: ["variable.parameter"],
  clsParameter: ["variable.parameter"],
  variable: ["variable.other.readwrite", "entity.name.variable"],
  "variable.readonly": ["variable.other.constant"],
  property: ["variable.other.property"],
  "property.readonly": ["variable.other.constant.property", "variable.other.constant"],
  enumMember: ["variable.other.enummember"],
  function: ["entity.name.function", "support.function"],
  method: ["entity.name.function.member", "support.function"],
  decorator: ["entity.name.decorator", "entity.name.function"],
};

/** Semantic token types the theme styles (others are dropped by the LSP client). */
export const SEMANTIC_TOKEN_TYPES: ReadonlySet<string> = new Set(
  Object.keys(SEMANTIC_SCOPES).map((k) => k.split(".")[0]),
);
/** Semantic token modifiers the theme styles (others are dropped by the LSP client). */
export const SEMANTIC_TOKEN_MODIFIERS: readonly string[] = ["readonly"];

/** Find the theme rule matching `scope` with the longest dotted-prefix match. */
function resolveScope(rules: monaco.editor.ITokenThemeRule[], scope: string): monaco.editor.ITokenThemeRule | undefined {
  let best: monaco.editor.ITokenThemeRule | undefined;
  for (const r of rules) {
    if (!r.token || !r.foreground) continue;
    if (scope !== r.token && !scope.startsWith(r.token + ".")) continue;
    if (!best || r.token.length > best.token.length) best = r;
  }
  return best;
}

function semanticRules(rules: monaco.editor.ITokenThemeRule[]): monaco.editor.ITokenThemeRule[] {
  const out: monaco.editor.ITokenThemeRule[] = [];
  for (const [token, scopes] of Object.entries(SEMANTIC_SCOPES)) {
    for (const scope of scopes) {
      const r = resolveScope(rules, scope);
      if (r) {
        out.push({ token, foreground: r.foreground, fontStyle: r.fontStyle });
        break;
      }
    }
  }
  return out;
}

let ready: Promise<void> | null = null;

/** Load Shiki and install its tokenizer + theme on Monaco. Memoized. */
export function ensureShiki(m: typeof monaco): Promise<void> {
  ready ??= (async () => {
    const highlighter = await createHighlighterCore({
      themes: [import("@shikijs/themes/dark-plus")],
      langs: [import("@shikijs/langs/python")],
      engine: createJavaScriptRegexEngine(),
    });
    if (!m.languages.getLanguages().some((l) => l.id === "python")) {
      m.languages.register({ id: "python" });
    }
    shikiToMonaco(highlighter, m as unknown as Parameters<typeof shikiToMonaco>[1]);

    // Re-define the theme with semantic-token rules appended. Shiki's own
    // tokenizer keeps using its original rule map, so TextMate colours are
    // unaffected.
    // @shikijs/monaco types against monaco-editor-core; same shape as ours.
    const base = textmateThemeToMonacoTheme(
      highlighter.getTheme(EDITOR_THEME),
    ) as unknown as monaco.editor.IStandaloneThemeData;
    m.editor.defineTheme(EDITOR_THEME, {
      ...base,
      rules: [...base.rules, ...semanticRules(base.rules)],
    });
    m.editor.setTheme(EDITOR_THEME);
  })();
  return ready;
}
