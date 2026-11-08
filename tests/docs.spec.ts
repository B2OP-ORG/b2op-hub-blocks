import { describe, expect, it } from "vitest";
import { parseStub, logicalLines, cleanDoc } from "../src/docs/stubParser";
import { apiModules, resolveName, resolveQualified, searchIndex, summary } from "../src/docs/apiModel";
import { rstToMarkdown } from "../src/docs/rst";

const SRC = `"""Module doc.

More text.
"""
from typing import overload
from lpf2.devices import hub_led as _hub_led
from . import lcd as lcd

led: _hub_led
"""The LED."""
RED: int = 9
"""Red."""

def plain(a: int, b: str = "x") -> None:
    """Do a thing.

    Args:
        a: first
    """
    ...

def oneline(x) -> int: ...

def multi(
    a: int,
    b: int,
) -> int:
    """Multi-line signature."""
    ...

class thing(base):
    """A thing."""

    speed: int
    """Speed."""

    def __init__(self, port: int) -> None: ...

    @staticmethod
    def make(n: int) -> "thing":
        """Factory."""
        ...

    @overload
    def go(self) -> None:
        """Go."""
        ...
    @overload
    def go(self, speed: int) -> None: ...

    def _hidden(self) -> None: ...
`;

describe("stubParser", () => {
  const m = parseStub(SRC, "hub", true);

  it("reads module docstring and imports", () => {
    expect(m.doc).toBe("Module doc.\n\nMore text.");
    expect(m.imports._hub_led).toBe("lpf2.devices.hub_led");
    expect(m.imports.lcd).toBe("hub.lcd");
  });

  it("reads attributes with docs", () => {
    expect(m.members.find((x) => x.name === "led")).toMatchObject({ kind: "attribute", type: "_hub_led", doc: "The LED." });
    expect(m.members.find((x) => x.name === "RED")).toMatchObject({ type: "int", value: "9", doc: "Red." });
  });

  it("reads functions incl. multi-line signatures", () => {
    expect(m.members.find((x) => x.name === "plain")).toMatchObject({ signature: '(a: int, b: str = "x") -> None', doc: "Do a thing.\n\nArgs:\n    a: first" });
    expect(m.members.find((x) => x.name === "oneline")).toMatchObject({ signature: "(x) -> int", doc: "" });
    expect(m.members.find((x) => x.name === "multi")).toMatchObject({ signature: "(a: int, b: int,) -> int", doc: "Multi-line signature." });
  });

  it("reads classes, strips self, merges overloads", () => {
    const cls = m.members.find((x) => x.name === "thing");
    expect(cls?.kind).toBe("class");
    if (cls?.kind !== "class") return;
    expect(cls.bases).toEqual(["base"]);
    expect(cls.doc).toBe("A thing.");
    const names = cls.members.map((x) => x.name);
    expect(names).toEqual(["speed", "__init__", "make", "go", "_hidden"]);
    expect(cls.members.find((x) => x.name === "__init__")).toMatchObject({ signature: "(port: int) -> None" });
    expect(cls.members.find((x) => x.name === "make")).toMatchObject({ signature: "(n: int) -> \"thing\"", decorators: ["staticmethod"] });
    expect(cls.members.find((x) => x.name === "go")).toMatchObject({ signature: "() -> None", overloads: ["(speed: int) -> None"], doc: "Go." });
  });

  it("ignores comments and joins brackets", () => {
    const ll = logicalLines("x: int  # comment\ny = (1,\n  2)\n");
    expect(ll.map((l) => l.text)).toEqual(["x: int", "y = (1, 2)"]);
  });

  it("cleanDoc dedents", () => {
    expect(cleanDoc("First.\n\n    Second\n      third\n")).toBe("First.\n\nSecond\n  third");
  });
});

describe("apiModel (real stubs)", () => {
  const mods = apiModules();

  it("includes hub and lpf2 packages only", () => {
    expect(mods.has("hub")).toBe(true);
    expect(mods.has("hub.lcd")).toBe(true);
    expect(mods.has("lpf2.devices")).toBe(true);
    expect(mods.has("lvgl")).toBe(false);
    expect(mods.get("hub")!.children).toContain("hub.lcd");
  });

  it("resolves aliases, locals and qualified names", () => {
    expect(resolveName("_hub_led", "hub")).toEqual({ module: "lpf2.devices", member: "hub_led" });
    expect(resolveName("sd_remount", "hub")).toEqual({ module: "hub", member: "sd_remount" });
    expect(resolveQualified("hub.lcd.on")).toEqual({ module: "hub.lcd", member: "on" });
    expect(resolveQualified("nope.nothing")).toBeNull();
  });

  it("builds a search index", () => {
    const hits = searchIndex();
    expect(hits.some((h) => h.label === "hub.lcd.on()")).toBe(true);
  });

  it("summarises first sentence", () => {
    expect(summary("Turn it on. Then more.\n\nDetails.")).toBe("Turn it on.");
  });
});

describe("rstToMarkdown", () => {
  const resolve = (n: string) => (n.includes("known") ? `doc:api:${n.replace(/^~/, "")}` : null);

  it("converts literals and roles", () => {
    expect(rstToMarkdown("Use ``x = 1`` and :func:`~mod.known` or :class:`Other`.", resolve))
      .toBe("Use `x = 1` and [`known`](doc:api:mod.known) or `Other`.");
  });

  it("converts code-block directives and literal blocks", () => {
    expect(rstToMarkdown("Example::\n\n    a = 1\n    b = 2\n\nDone.")).toBe("Example:\n\n```python\na = 1\nb = 2\n```\n\nDone.");
    expect(rstToMarkdown(".. code-block:: python\n\n   hub.lcd.on()\n")).toBe("```python\nhub.lcd.on()\n```");
  });

  it("converts Google-style sections", () => {
    expect(rstToMarkdown("Args:\n    speed (int): how fast,\n        -100..100\n    port: which port\nReturns:\n    Nothing."))
      .toBe("**Args:**\n\n- **speed** (int): how fast, -100..100\n- **port**: which port\n\n**Returns:**\n\n- Nothing.");
  });
});

import { GUIDES } from "../src/docs/guides";
import { pageContent } from "../src/docs/pages";
import { apiModules as allModules } from "../src/docs/apiModel";
import { exampleTitle, groupExamples, exampleDescription, pathInExample } from "../src/examples/model";

describe("guides", () => {
  it("has all listed guides", () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(20);
  });

  it("every ::: api embed and doc: link resolves", () => {
    const broken: string[] = [];
    for (const g of GUIDES) {
      for (const m of g.markdown.matchAll(/^:::\s*api\s+([\w.]+)\s*$/gm)) {
        if (!resolveQualified(m[1])?.member) broken.push(`${g.id}: ::: api ${m[1]}`);
      }
      for (const m of g.markdown.matchAll(/\(doc:([^)]+)\)/g)) {
        if (!pageContent(m[1])) broken.push(`${g.id}: doc:${m[1]}`);
      }
      expect(pageContent(`guide:${g.id}`)!.markdown).not.toContain("Unknown reference");
    }
    expect(broken).toEqual([]);
  });

  it("every API module page renders", () => {
    for (const name of allModules().keys()) {
      const page = pageContent(`api:${name}`);
      expect(page?.markdown.length).toBeGreaterThan(10);
    }
  });
});

describe("examples model", () => {
  it("makes friendly titles", () => {
    expect(exampleTitle("grove_i2c_mpu6050.py")).toBe("Grove i2c mpu6050");
    expect(exampleTitle("dumbCar.py")).toBe("Dumb car");
    expect(exampleTitle("project_demo")).toBe("Project demo");
  });

  it("groups files and folders", () => {
    const g = groupExamples(["b.py", "project_demo/main.py", "project_demo/ticker.py", "a.py"]);
    expect(g.map((e) => e.id)).toEqual(["a.py", "b.py", "project_demo"]);
    expect(g[2]).toMatchObject({ folder: true, files: ["project_demo/main.py", "project_demo/ticker.py"] });
    expect(pathInExample(g[2], "project_demo/ticker.py")).toBe("ticker.py");
    expect(pathInExample(g[0], "a.py")).toBe("a.py");
  });

  it("reads descriptions from docstrings or comments", () => {
    expect(exampleDescription('"""Remote hub scanner: mirror status."""\nimport x')).toBe("Remote hub scanner: mirror status.");
    expect(exampleDescription('"""Project demo — a folder.\n\nMore."""')).toBe("Project demo — a folder.");
    expect(exampleDescription("# Blink the LED\nimport hub")).toBe("Blink the LED");
    expect(exampleDescription("import hub")).toBe("");
  });
});
