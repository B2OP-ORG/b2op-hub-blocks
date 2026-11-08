// Python language configuration for Monaco (brackets, auto-closing pairs,
// indentation rules). Syntax colouring is handled by Shiki — see shikiSetup.ts.

import type * as monaco from "monaco-editor";

export const PYTHON_LANGUAGE_CONFIG: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: "#" },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"', notIn: ["string"] },
    { open: "'", close: "'", notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  indentationRules: {
    increaseIndentPattern: /^\s*(?:class|def|elif|else|except|finally|for|if|try|while|with)\b.*:\s*(?:#.*)?$/,
    decreaseIndentPattern: /^\s*(?:elif|else|except|finally)\b.*:\s*(?:#.*)?$/,
  },
  onEnterRules: [
    {
      beforeText: /:\s*(?:#.*)?$/,
      action: { indentAction: 1 /* Indent */ },
    },
  ],
};

/** Install the Python language configuration on a Monaco namespace. Idempotent. */
export function registerPythonLanguageConfig(m: typeof monaco): void {
  // The slim Monaco build doesn't register any languages; do it here.
  if (!m.languages.getLanguages().some((l) => l.id === "python")) {
    m.languages.register({ id: "python", extensions: [".py"], aliases: ["Python", "python"] });
  }
  m.languages.setLanguageConfiguration("python", PYTHON_LANGUAGE_CONFIG);
}
