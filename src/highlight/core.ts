// Shared Shiki highlighter (Python grammar, dark/light plus themes). Used by the
// Monaco editor tokenizer and by Docs code blocks, so both look identical.

import type { HighlighterCore } from "shiki/core";

let ready: Promise<HighlighterCore> | null = null;

export function loadHighlighter(): Promise<HighlighterCore> {
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
