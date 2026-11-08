// Turns a doc page id into Markdown: guide pages come from ./guides, API
// pages are generated from the parsed stubs.
//
// Page ids:  "guide:<id>"  |  "api:<module>"  |  "api:<module>#<member.path>"

import { guideById } from "./guides";
import {
  apiModules, classesOf, parseApiId, publicMembers, resolveName, resolveQualified, summary, targetId,
  type ApiModule,
} from "./apiModel";
import { rstToMarkdown } from "./rst";
import type { ApiAttribute, ApiClass, ApiFunction, ApiMember } from "./stubParser";

export interface DocPageContent {
  title: string;
  markdown: string;
  /** Element id to scroll to after rendering. */
  anchor?: string;
}

export const anchorFor = (member: string) => `api-${member.replace(/\./g, "-")}`;

/** Link resolver for docstrings; `cls` lets `:meth:\`foo\`` find sibling methods. */
const linker = (module: string, cls?: string) => (name: string) => {
  const clean = name.replace(/^~/, "");
  const t = (cls && !clean.includes(".") ? resolveName(`${cls}.${clean}`, module) : null) ?? resolveName(clean, module);
  return t ? `doc:${targetId(t)}` : null;
};

/** Plain-English label for a type annotation; links names we document. */
function typeText(type: string, module: string): string {
  return type.replace(/[A-Za-z_][\w.]*/g, (name) => {
    if (["int", "float", "str", "bool", "bytes", "None", "list", "tuple", "dict", "Optional", "Union", "Sequence", "Callable", "Any", "NoReturn"].includes(name)) return name;
    const t = resolveName(name, module);
    return t ? `[${t.member.split(".").pop() || t.module}](doc:${targetId(t)})` : name.replace(/^_/, "");
  });
}

function docBody(doc: string, module: string, cls?: string): string {
  return doc ? rstToMarkdown(doc, linker(module, cls)) : "_No description yet._";
}

function fnCard(fn: ApiFunction, module: string, owner: string, anchorPath: string, level: number): string {
  const call = `${owner}.${fn.name}`;
  const sigs = [fn.signature, ...fn.overloads].map((s) => call + s).join("\n");
  const heading = `${"#".repeat(level)} ${fn.name === "__init__" ? `Create a ${owner}` : `${fn.name}()`}`;
  const code = fn.name === "__init__" ? sigs.replace(`${call}(`, `${owner}(`) : sigs;
  return `<a id="${anchorFor(anchorPath)}"></a>\n\n${heading}\n\n\`\`\`python\n${code}\n\`\`\`\n\n${docBody(fn.doc, module, owner === module ? undefined : owner)}\n`;
}

function attrCard(a: ApiAttribute, module: string, owner: string, anchorPath: string, level: number): string {
  const typ = a.type ? ` — ${typeText(a.type, module)}` : "";
  const val = a.value !== undefined ? ` = \`${a.value}\`` : "";
  return `<a id="${anchorFor(anchorPath)}"></a>\n\n${"#".repeat(level)} ${owner}.${a.name}\n\n<span class="doc-meta">${val ? `value${val}` : ""}${typ}</span>\n\n${a.doc ? rstToMarkdown(a.doc, linker(module, owner === module ? undefined : owner)) : ""}\n`;
}

/** Compact table for groups of constants (colors, port numbers…). */
function constTable(attrs: ApiAttribute[], module: string, owner: string): string {
  const rows = attrs.map((a) => `| <a id="${anchorFor(a.name)}"></a>\`${owner}.${a.name}\` | ${a.value ?? ""} | ${a.doc ? rstToMarkdown(summary(a.doc), linker(module)) : ""} |`);
  return `| Name | Value | Meaning |\n|---|---|---|\n${rows.join("\n")}\n`;
}

function classSection(cls: ApiClass, module: string, level: number): string {
  const parts = [`<a id="${anchorFor(cls.name)}"></a>\n\n${"#".repeat(level)} ${cls.name}\n\n${docBody(cls.doc, module, cls.name)}\n`];
  const bases = cls.bases.map((b) => resolveName(b, module)).filter((t) => t !== null);
  if (bases.length) parts.push(`_Also has everything from ${bases.map((t) => `[${t.member || t.module}](doc:${targetId(t)})`).join(", ")}._\n`);
  for (const m of cls.members.filter((m) => m.name === "__init__").concat(publicMembers(cls.members))) {
    if (m.kind === "function") parts.push(fnCard(m, module, cls.name, `${cls.name}.${m.name}`, level + 1));
    else if (m.kind === "attribute") parts.push(attrCard(m, module, cls.name, `${cls.name}.${m.name}`, level + 1));
    else parts.push(classSection(m, module, level + 1));
  }
  return parts.join("\n");
}

function moduleMarkdown(mod: ApiModule, mods: Map<string, ApiModule>): string {
  const out: string[] = [`# ${mod.title}`, `<span class="doc-meta">\`import ${mod.name.split(".")[0]}\` · \`${mod.name}\`</span>`, docBody(mod.doc, mod.name)];
  const members = publicMembers(mod.members);
  const fns = members.filter((m): m is ApiFunction => m.kind === "function");
  const attrs = members.filter((m): m is ApiAttribute => m.kind === "attribute");
  const classes = classesOf(mod);

  if (mod.children.length) {
    out.push("## Sections", mod.children.map((c) => `- [${mods.get(c)!.title}](doc:api:${c}) — ${summary(mods.get(c)!.doc)}`).join("\n"));
  }
  if (attrs.length) {
    // All-constant modules (enums) read best as a table.
    const constants = attrs.filter((a) => /^[A-Z0-9_]+$/.test(a.name));
    if (constants.length === attrs.length && constants.length > 3) out.push("## Values", constTable(constants, mod.name, mod.name));
    else out.push("## Things you can use", ...attrs.map((a) => attrCard(a, mod.name, mod.name, a.name, 3)));
  }
  if (fns.length) out.push("## Functions", ...fns.map((f) => fnCard(f, mod.name, mod.name, f.name, 3)));
  if (classes.length) out.push("## Types", ...classes.map((c) => classSection(c, mod.name, 3)));
  return out.join("\n\n");
}

/** Reference card for one symbol, used by `::: api <name>` in guides. */
export function symbolCard(qualified: string): string {
  const t = resolveQualified(qualified);
  if (!t || !t.member) return `> Unknown reference: \`${qualified}\``;
  const mods = apiModules();
  const mod = mods.get(t.module)!;
  const path = t.member.split(".");
  let owner: string = t.module;
  let members: ApiMember[] = mod.members;
  let found: ApiMember | undefined;
  for (const [i, name] of path.entries()) {
    found = members.find((m) => m.name === name);
    if (!found) break;
    if (i < path.length - 1) {
      if (found.kind !== "class") { found = undefined; break; }
      owner = found.name;
      members = found.members;
    }
  }
  if (!found) return `> Unknown reference: \`${qualified}\``;
  const body = found.kind === "function" ? fnCard(found, t.module, owner, t.member, 4)
    : found.kind === "attribute" ? attrCard(found, t.module, owner, t.member, 4)
    : `#### ${found.name}\n\n${docBody(found.doc, t.module)}`;
  const link = `[More in the reference →](doc:${targetId(t)})`;
  // Anchors inside embedded cards would clash with reference pages.
  return `<div class="doc-card">\n\n${body.replace(/<a id="[^"]*"><\/a>\n\n/g, "")}\n${link}\n\n</div>`;
}

function expandGuide(md: string): string {
  return md.replace(/^:::[ \t]*api[ \t]+([\w.]+)[ \t]*$/gm, (_, name: string) => symbolCard(name));
}

export function pageContent(id: string): DocPageContent | null {
  if (id.startsWith("guide:")) {
    const g = guideById(id.slice(6));
    return g ? { title: g.title, markdown: expandGuide(g.markdown) } : null;
  }
  const t = parseApiId(id);
  if (!t) return null;
  const mods = apiModules();
  const mod = mods.get(t.module);
  if (!mod) return null;
  return { title: mod.title, markdown: moduleMarkdown(mod, mods), anchor: t.member ? anchorFor(t.member) : undefined };
}

