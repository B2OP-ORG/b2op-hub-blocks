// User-facing API reference model, built by parsing the bundled LSP stubs.

import { STUBS } from "../editor/lsp/stubs";
import { parseStub, type ApiClass, type ApiMember } from "./stubParser";

export interface ApiModule {
  /** Dotted module name, e.g. "hub.lcd". */
  name: string;
  /** Friendly title, e.g. "Screen". */
  title: string;
  doc: string;
  members: ApiMember[];
  imports: Record<string, string>;
  /** Direct child module names. */
  children: string[];
}

/** Top-level packages shown in the reference. Others (typings, lvgl, …) are MicroPython/internal. */
const ROOTS = ["hub", "lpf2"];

/** Friendly names for modules. Missing entries fall back to the module name. */
const TITLES: Record<string, string> = {
  hub: "The hub",
  "hub.ports": "Ports",
  "hub.buttons": "Buttons",
  "hub.imu": "Motion sensor",
  "hub.lcd": "Screen",
  "hub.audio": "Sound",
  "hub.video": "Video",
  "hub.battery": "Battery",
  "hub.board": "Board details (advanced)",
  "hub.log": "Status log",
  "hub.settings": "Settings",
  lpf2: "LEGO devices",
  "lpf2.devices": "Motors, sensors & lights",
  "lpf2.color": "Colors",
  "lpf2.device_type": "Device types",
  "lpf2.port_num": "Port numbers",
  "lpf2.hub_type": "Hub types",
  "lpf2.hub_property": "Hub properties",
  "lpf2.alerts": "Alerts",
  "lpf2.battery_type": "Battery types",
  "lpf2.button_state": "Button states",
  "lpf2.local": "Hub ports",
  "lpf2.virtual": "Virtual ports",
  "lpf2.port_expander": "Port expander",
  "lpf2.port_expander.port_num": "Expander port numbers",
  "lpf2.port_num.controlplus": "Control+ hub ports",
  "lpf2.port_num.duplotrain": "DUPLO train ports",
  "lpf2.port_num.mario": "Mario ports",
  "lpf2.port_num.movehub": "BOOST Move hub ports",
  "lpf2.port_num.poweredup": "Powered Up hub ports",
  "lpf2.port_num.poweredupremote": "Powered Up remote ports",
};

export const isPublic = (name: string) => !name.startsWith("_");

function moduleNameOf(path: string): { name: string; pkg: boolean } | null {
  const m = /^(.*)\.pyi?$/.exec(path);
  if (!m) return null;
  const parts = m[1].split("/");
  const pkg = parts[parts.length - 1] === "__init__";
  if (pkg) parts.pop();
  return { name: parts.join("."), pkg };
}

let cache: Map<string, ApiModule> | null = null;

/** All reference modules keyed by name. Memoized. */
export function apiModules(stubs: Record<string, string> = STUBS): Map<string, ApiModule> {
  if (cache && stubs === STUBS) return cache;
  const out = new Map<string, ApiModule>();
  // Prefer .pyi over .py when both exist.
  const entries = Object.entries(stubs).sort(([a], [b]) => (a.endsWith(".pyi") ? 1 : 0) - (b.endsWith(".pyi") ? 1 : 0));
  for (const [path, src] of entries) {
    const mn = moduleNameOf(path);
    if (!mn || !ROOTS.includes(mn.name.split(".")[0])) continue;
    const parsed = parseStub(src, mn.name, mn.pkg);
    out.set(mn.name, { name: mn.name, title: TITLES[mn.name] ?? mn.name, ...parsed, children: [] });
  }
  for (const mod of out.values()) {
    const parent = mod.name.split(".").slice(0, -1).join(".");
    out.get(parent)?.children.push(mod.name);
  }
  for (const mod of out.values()) mod.children.sort((a, b) => (out.get(a)!.title).localeCompare(out.get(b)!.title));
  if (stubs === STUBS) cache = out;
  return out;
}

export const rootModules = (mods = apiModules()) => ROOTS.filter((r) => mods.has(r));

/** Location of an API symbol: the module page plus a member path anchor. */
export interface ApiTarget {
  module: string;
  /** e.g. "port.setPower" or "" for the module itself. */
  member: string;
}

function findMember(members: ApiMember[], path: string[]): ApiMember | undefined {
  const [head, ...rest] = path;
  const m = members.find((x) => x.name === head);
  if (!m || !rest.length) return m;
  return m.kind === "class" ? findMember(m.members, rest) : undefined;
}

/** Resolve a dotted name to a reference location, or null. */
export function resolveQualified(qualified: string, mods = apiModules()): ApiTarget | null {
  const parts = qualified.split(".");
  for (let i = parts.length; i > 0; i--) {
    const mod = mods.get(parts.slice(0, i).join("."));
    if (!mod) continue;
    const rest = parts.slice(i);
    if (!rest.length) return { module: mod.name, member: "" };
    if (findMember(mod.members, rest)) return { module: mod.name, member: rest.join(".") };
    // Name re-exported from another module (e.g. `from lpf2.local import port as _port`).
    const imported = mod.imports[rest[0]];
    if (imported && imported !== qualified) return resolveQualified([imported, ...rest.slice(1)].join("."), mods);
    return null;
  }
  return null;
}

/**
 * Resolve a name as written inside `fromModule` (docstring roles, type
 * annotations): local alias, local member, then fully qualified.
 */
export function resolveName(name: string, fromModule: string, mods = apiModules()): ApiTarget | null {
  const clean = name.replace(/^~/, "").replace(/\(\)$/, "");
  const mod = mods.get(fromModule);
  if (mod) {
    const [head, ...rest] = clean.split(".");
    const imp = mod.imports[head];
    if (imp) return resolveQualified([imp, ...rest].join("."), mods);
    const local = resolveQualified(`${fromModule}.${clean}`, mods);
    if (local) return local;
  }
  return resolveQualified(clean, mods);
}

export const targetId = (t: ApiTarget) => `api:${t.module}${t.member ? "#" + t.member : ""}`;

export function parseApiId(id: string): ApiTarget | null {
  const m = /^api:([\w.]+)(?:#([\w.]+))?$/.exec(id);
  return m ? { module: m[1], member: m[2] ?? "" } : null;
}

/** Look up a member by target. */
export function memberAt(t: ApiTarget, mods = apiModules()): ApiMember | undefined {
  const mod = mods.get(t.module);
  return mod && t.member ? findMember(mod.members, t.member.split(".")) : undefined;
}

export const publicMembers = (members: ApiMember[]) =>
  members.filter((m) => isPublic(m.name) && !(m.kind === "function" && m.name.startsWith("__")));

/** Classes in a module, public members only. */
export const classesOf = (mod: ApiModule) => publicMembers(mod.members).filter((m): m is ApiClass => m.kind === "class");

/** First sentence of a docstring, for list summaries. */
export function summary(doc: string): string {
  const para = doc.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(para);
  return (m ? m[1] : para).replace(/``?([^`]+)``?/g, "$1").replace(/:\w+:`~?([^`]+)`/g, "$1");
}

export interface SearchHit {
  id: string;
  label: string;
  detail: string;
}

/** Flat list of every public symbol, for search. */
export function searchIndex(mods = apiModules()): SearchHit[] {
  const out: SearchHit[] = [];
  const walk = (module: string, members: ApiMember[], prefix: string) => {
    for (const m of publicMembers(members)) {
      const path = prefix ? `${prefix}.${m.name}` : m.name;
      out.push({ id: targetId({ module, member: path }), label: `${module}.${path}${m.kind === "function" ? "()" : ""}`, detail: summary(m.doc) });
      if (m.kind === "class") walk(module, m.members, path);
    }
  };
  for (const mod of mods.values()) {
    out.push({ id: targetId({ module: mod.name, member: "" }), label: mod.title === mod.name ? mod.name : `${mod.title} (${mod.name})`, detail: summary(mod.doc) });
    walk(mod.name, mod.members, "");
  }
  return out;
}
