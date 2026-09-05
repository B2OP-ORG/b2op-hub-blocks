#!/usr/bin/env node
// Sync LSP stubs from the Lpf2-micropython firmware tree into
// src/editor/lsp/stubs/files, then append per-file overlays from
// scripts/stubs-overlay for symbols that live in the on-device Python
// shim layer (e.g. hub.sleep) and are not present in the fw source.
//
// Usage:
//   node scripts/sync-stubs.mjs --src <path-to-Lpf2-micropython>
//   npm run sync-stubs -- --src ../Lpf2-micropython
//
// The fw source layout expected under <src>:
//   stubs/                         → files/           (whole tree, overwrite)
//   modules/Lpf2/stubs/lpf2/       → files/lpf2/      (overwrite)
//   typings/                       → files/           (merged, non-overwriting
//                                                      of stubs/ entries and of
//                                                      LOCAL_ONLY entries)
//
// Local-only files preserved verbatim (never touched by sync):
//   pyrightconfig.json

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const DEST = path.join(REPO_ROOT, "src/editor/lsp/stubs/files");
const OVERLAY = path.join(REPO_ROOT, "scripts/stubs-overlay");

const LOCAL_ONLY = new Set(["pyrightconfig.json"]);

function parseArgs(argv) {
  const out = { src: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--src" || a === "-s") out.src = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function copyTree(src, dest, { overwrite = true } = {}) {
  const stat = await fs.stat(src);
  if (stat.isFile()) {
    if (!overwrite && await pathExists(dest)) return 0;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return 1;
  }
  let n = 0;
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) n += await copyTree(s, d, { overwrite });
    else if (entry.isFile()) {
      if (!overwrite && await pathExists(d)) continue;
      await fs.copyFile(s, d);
      n++;
    }
  }
  return n;
}

async function clearDest() {
  if (!(await pathExists(DEST))) return;
  for (const entry of await fs.readdir(DEST, { withFileTypes: true })) {
    if (LOCAL_ONLY.has(entry.name)) continue;
    await fs.rm(path.join(DEST, entry.name), { recursive: true, force: true });
  }
}

const OVERLAY_SEP =
  "\n\n# --- shim overlay (scripts/stubs-overlay) ------------------------\n";

async function applyOverlays() {
  if (!(await pathExists(OVERLAY))) return 0;
  let n = 0;
  async function walk(dir, rel) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const s = path.join(dir, entry.name);
      const r = path.join(rel, entry.name);
      const d = path.join(DEST, r);
      if (entry.isDirectory()) { await walk(s, r); continue; }
      const overlay = await fs.readFile(s, "utf8");
      if (await pathExists(d)) {
        const base = await fs.readFile(d, "utf8");
        await fs.writeFile(d, base.replace(/\s*$/, "") + OVERLAY_SEP + overlay);
      } else {
        await fs.mkdir(path.dirname(d), { recursive: true });
        await fs.writeFile(d, overlay);
      }
      n++;
    }
  }
  await walk(OVERLAY, "");
  return n;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.src) {
    console.log("Usage: node scripts/sync-stubs.mjs --src <path-to-Lpf2-micropython>");
    process.exit(args.help ? 0 : 1);
  }
  const SRC = path.resolve(args.src);
  if (!(await pathExists(SRC))) {
    console.error(`fw source not found: ${SRC}`);
    process.exit(1);
  }

  const mappings = [
    { from: path.join(SRC, "stubs"),                   to: DEST,                        kind: "dir"       },
    { from: path.join(SRC, "modules/Lpf2/stubs/lpf2"), to: path.join(DEST, "lpf2"),     kind: "dir"       },
    { from: path.join(SRC, "ports/b2op/fs"),           to: DEST,                        kind: "dir-merge" },
    { from: path.join(SRC, "typings"),                 to: DEST,                        kind: "dir-merge" },
  ];

  await clearDest();

  let total = 0;
  for (const m of mappings) {
    if (!(await pathExists(m.from))) {
      console.warn(`skip (missing): ${path.relative(SRC, m.from)}`);
      continue;
    }
    if (m.kind === "file") {
      await fs.mkdir(path.dirname(m.to), { recursive: true });
      await fs.copyFile(m.from, m.to);
      total++;
    } else if (m.kind === "dir") {
      total += await copyTree(m.from, m.to, { overwrite: true });
    } else if (m.kind === "dir-merge") {
      total += await copyTree(m.from, m.to, { overwrite: false });
    }
    console.log(`ok: ${path.relative(SRC, m.from)} → ${path.relative(REPO_ROOT, m.to)}`);
  }

  const overlaid = await applyOverlays();
  console.log(`copied ${total} files, applied ${overlaid} overlay files`);
}

main().catch((e) => { console.error(e); process.exit(1); });
