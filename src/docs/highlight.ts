// Shiki highlighter for code blocks in the Docs tab. Same grammar and themes
// as the Monaco editor so snippets look identical to code in the editor.

import type { HighlighterCore } from "shiki/core";

let ready: Promise<HighlighterCore> | null = null;

export function loadDocHighlighter(): Promise<HighlighterCore> {
  ready ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("@shikijs/engine-javascript"),
    ]);
    return createHighlighterCore({
      themes: [import("@shikijs/themes/dark-plus"), import("@shikijs/themes/light-plus")],
      langs: [import("@shikijs/langs/python")],
      engine: createJavaScriptRegexEngine(),
    });
  })();
  return ready;
}
