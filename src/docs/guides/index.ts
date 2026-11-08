// Friendly guide pages. Each is a Markdown file in this folder; the order and
// grouping here is the order shown in the Docs tab.
//
// Special syntax (handled by DocPage):
//   [text](doc:guide:<id>)          link to another guide
//   [text](doc:api:hub.lcd#on)      link to a reference entry
//   ::: api hub.lcd.backlight       embed that function's reference card
//                                   (docstring comes from the stubs, so the
//                                   text stays in sync with editor hovers)

const raw = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface Guide {
  id: string;
  title: string;
  group: string;
  markdown: string;
}

const ORDER: { group: string; ids: string[] }[] = [
  { group: "Start here", ids: ["getting-started", "program-lifecycle", "examples"] },
  { group: "The hub", ids: ["ports", "light", "buttons", "motion-sensor", "screen", "sound", "battery", "i2c", "board"] },
  { group: "LEGO devices", ids: ["lego-devices", "motors", "sensors", "colors-and-constants", "remote-control", "port-expander", "virtual-ports", "pretend-to-be-a-hub"] },
];

function titleOf(md: string, id: string): string {
  return /^#\s+(.+)$/m.exec(md)?.[1].trim() ?? id;
}

export const GUIDES: Guide[] = ORDER.flatMap(({ group, ids }) =>
  ids
    .map((id) => ({ id, md: raw[`./${id}.md`] }))
    .filter((g): g is { id: string; md: string } => typeof g.md === "string")
    .map(({ id, md }) => ({ id, group, title: titleOf(md, id), markdown: md })),
);

export const guideById = (id: string) => GUIDES.find((g) => g.id === id);
