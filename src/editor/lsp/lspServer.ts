// Pure stub-driven LSP server. Testable without a Web Worker: feed messages
// via `handle()`, receive replies + notifications through the `emit` callback.
// The Web Worker wrapper (pyright.worker.ts) is a thin adapter around this.

import { buildIndex, childrenOf, resolveChain, type StubIndex, type Symbol as StubSymbol } from "./stubParser";

export interface RpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface LspServer {
  handle(msg: RpcMessage): void;
  /** Test/debug helper. */
  getDocument(uri: string): string | undefined;
}

/**
 * Build a server bound to the given stub set. `emit` is invoked for every
 * outbound message (responses to requests + publishDiagnostics notifications).
 */
export function createLspServer(stubs: Record<string, string>, emit: (msg: RpcMessage) => void): LspServer {
  const documents = new Map<string, string>();
  // Per-URI scope info: file-scope bindings + position-scoped narrowings
  // (from `if isinstance(name, Type):` blocks).
  const localScopes = new Map<string, DocScope>();
  const index: StubIndex = buildIndex(stubs);

  function respond(id: number | string, result: unknown): void {
    emit({ jsonrpc: "2.0", id, result });
  }
  function notify(method: string, params: unknown): void {
    emit({ jsonrpc: "2.0", method, params });
  }

  /**
   * Rewrite `chain` so that if its head is a locally bound (or narrowed)
   * name, it starts with the underlying stub chain instead. `line` is the
   * cursor's line number — used to pick the innermost live `isinstance`
   * narrowing at that position.
   *
   * Precedence: narrowing at line → file-scope binding → bare name → builtins.
   */
  function applyBindings(uri: string, chain: string[], line: number): string[] {
    if (!chain.length) return chain;
    const scope = localScopes.get(uri);
    let out = chain;
    for (let i = 0; i < 8; i++) {
      const bind = lookupBinding(scope, out[0], line);
      if (!bind) break;
      out = [...bind, ...out.slice(1)];
    }
    if (!index.symbols.has(out[0]) && index.symbols.has(`builtins.${out[0]}`)) {
      out = ["builtins", ...out];
    }
    return out;
  }

  function handleCompletion(params: any): unknown {
    const uri = params.textDocument.uri as string;
    const line = params.position.line as number;
    const character = params.position.character as number;
    const source = documents.get(uri) ?? "";
    const lineText = source.split("\n")[line] ?? "";
    const chain = chainAt(lineText, character);
    const rebind = (parts: string[]) => applyBindings(uri, parts, line);

    // Hide Python-private (`_`-prefixed) helpers unless the user is explicitly
    // typing an underscore. Vendored stubs expose lots of implementation
    // classes at module scope (e.g. `_Buttons`, `_Vec3`) that should not
    // appear in the completion popup.
    const query = chain.trailingDot ? "" : chain.parts[chain.parts.length - 1] ?? "";
    const wantsPrivate = query.startsWith("_");
    const notPrivate = (s: StubSymbol) => wantsPrivate || !s.name.startsWith("_");

    let items: StubSymbol[] = [];
    if (chain.trailingDot && chain.parts.length) {
      const target = resolveChain(index, rebind(chain.parts));
      if (target) items = childrenOf(index, target).filter(notPrivate);
    } else if (chain.parts.length === 1 && !chain.trailingDot) {
      const q = chain.parts[0].toLowerCase();
      for (const [key, sym] of index.symbols) {
        if (!key.includes(".") && sym.name.toLowerCase().startsWith(q) && notPrivate(sym)) {
          items.push(sym);
        }
      }
      // Also propose Python builtins (`isinstance`, `print`, `len`, ...) that
      // are visible in every scope without an explicit import.
      const builtins = index.symbols.get("builtins");
      if (builtins) {
        for (const child of childrenOf(index, builtins)) {
          if (child.name.toLowerCase().startsWith(q) && notPrivate(child)) items.push(child);
        }
      }
      const scope = localScopes.get(uri);
      if (scope) {
        for (const [name, target] of scope.globals) {
          if (!name.toLowerCase().startsWith(q)) continue;
          const sym = resolveChain(index, target);
          if (sym) items.push({ ...sym, name, parent: "" });
        }
      }
    } else if (chain.parts.length > 1 && !chain.trailingDot) {
      const parent = resolveChain(index, rebind(chain.parts.slice(0, -1)));
      if (parent) {
        const q = chain.parts[chain.parts.length - 1].toLowerCase();
        for (const child of childrenOf(index, parent)) {
          if (child.name.toLowerCase().startsWith(q) && notPrivate(child)) items.push(child);
        }
      }
    }

    return {
      isIncomplete: false,
      items: items.map((s) => ({
        label: s.name,
        kind: completionItemKind(s.kind),
        detail: s.detail.split("\n")[0],
        documentation: s.doc ? { kind: "markdown", value: s.doc } : undefined,
        insertText: s.name,
      })),
    };
  }

  function handleHover(params: any): unknown {
    const uri = params.textDocument.uri as string;
    const line = params.position.line as number;
    const character = params.position.character as number;
    const source = documents.get(uri) ?? "";
    const lineText = source.split("\n")[line] ?? "";
    let end = character;
    while (end < lineText.length && ID_CHAR.test(lineText[end])) end++;
    const chain = chainAt(lineText, end);
    if (!chain.parts.length) return null;
    const sym = resolveChain(index, applyBindings(uri, chain.parts, line));
    if (!sym) return null;
    const md = ["```python", sym.detail, "```"];
    if (sym.doc) md.push("", sym.doc);
    return { contents: { kind: "markdown", value: md.join("\n") } };
  }

  function handleSignatureHelp(params: any): unknown {
    const uri = params.textDocument.uri as string;
    const line = params.position.line as number;
    const character = params.position.character as number;
    const source = documents.get(uri) ?? "";
    const lineText = source.split("\n")[line] ?? "";
    let depth = 0;
    let openIdx = -1;
    let activeParam = 0;
    for (let i = character - 1; i >= 0; i--) {
      const c = lineText[i];
      if (c === ")") depth++;
      else if (c === "(") {
        if (depth === 0) { openIdx = i; break; }
        depth--;
      } else if (c === "," && depth === 0) activeParam++;
    }
    if (openIdx < 0) return null;
    const chain = chainAt(lineText, openIdx);
    if (!chain.parts.length) return null;
    const sym = resolveChain(index, applyBindings(uri, chain.parts, line));
    if (!sym || (sym.kind !== "function" && sym.kind !== "method")) return null;

    const signatures = sym.detail.split("\n").map((detail) => {
      const paramMatch = detail.match(/\(([^)]*)\)/);
      const params = paramMatch
        ? paramMatch[1]
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p && p !== "self")
            .map((p) => ({ label: p }))
        : [];
      return {
        label: detail,
        documentation: sym.doc ? { kind: "markdown", value: sym.doc } : undefined,
        parameters: params,
      };
    });

    return {
      signatures,
      activeSignature: 0,
      activeParameter: Math.min(activeParam, Math.max(0, (signatures[0]?.parameters.length ?? 1) - 1)),
    };
  }

  function diagnose(uri: string, source: string): void {
    const diagnostics: unknown[] = [];
    const lines = source.split("\n");
    const stack: { ch: string; line: number; col: number }[] = [];
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    lines.forEach((ln, li) => {
      if (/^\t* +\t/.test(ln)) {
        diagnostics.push({
          range: { start: { line: li, character: 0 }, end: { line: li, character: ln.length } },
          severity: 2,
          message: "Mixed tabs and spaces in indentation",
          source: "b2op-hub-lsp",
        });
      }
      let inStr: string | null = null;
      for (let c = 0; c < ln.length; c++) {
        const ch = ln[c];
        if (inStr) { if (ch === inStr && ln[c - 1] !== "\\") inStr = null; continue; }
        if (ch === '"' || ch === "'") { inStr = ch; continue; }
        if (ch === "#") break;
        if ("([{".includes(ch)) stack.push({ ch, line: li, col: c });
        else if (")]}".includes(ch)) {
          const top = stack.pop();
          if (!top || top.ch !== pairs[ch]) {
            diagnostics.push({
              range: { start: { line: li, character: c }, end: { line: li, character: c + 1 } },
              severity: 1,
              message: `Unmatched '${ch}'`,
              source: "b2op-hub-lsp",
            });
          }
        }
      }
    });
    for (const open of stack) {
      diagnostics.push({
        range: { start: { line: open.line, character: open.col }, end: { line: open.line, character: open.col + 1 } },
        severity: 1,
        message: `Unclosed '${open.ch}'`,
        source: "b2op-hub-lsp",
      });
    }
    notify("textDocument/publishDiagnostics", { uri, diagnostics });
  }

  function handle(msg: RpcMessage): void {
    if (!msg || msg.jsonrpc !== "2.0") return;
    try {
      switch (msg.method) {
        case "initialize":
          respond(msg.id!, {
            capabilities: {
              textDocumentSync: 1,
              completionProvider: { triggerCharacters: ["."] },
              hoverProvider: true,
              signatureHelpProvider: { triggerCharacters: ["(", ","] },
              definitionProvider: false,
            },
            serverInfo: { name: "b2op-hub-stub-lsp", version: "0.1.0" },
          });
          break;
        case "initialized":
        case "workspace/didChangeConfiguration":
          break;
        case "shutdown":
          respond(msg.id!, null);
          break;
        case "exit":
          break;
        case "textDocument/didOpen": {
          const p = msg.params as any;
          documents.set(p.textDocument.uri, p.textDocument.text);
          localScopes.set(p.textDocument.uri, scanScopes(p.textDocument.text));
          diagnose(p.textDocument.uri, p.textDocument.text);
          break;
        }
        case "textDocument/didChange": {
          const p = msg.params as any;
          const change = p.contentChanges[p.contentChanges.length - 1];
          documents.set(p.textDocument.uri, change.text);
          localScopes.set(p.textDocument.uri, scanScopes(change.text));
          diagnose(p.textDocument.uri, change.text);
          break;
        }
        case "textDocument/didClose": {
          const p = msg.params as any;
          documents.delete(p.textDocument.uri);
          localScopes.delete(p.textDocument.uri);
          break;
        }
        case "textDocument/completion":
          respond(msg.id!, handleCompletion(msg.params));
          break;
        case "textDocument/hover":
          respond(msg.id!, handleHover(msg.params));
          break;
        case "textDocument/signatureHelp":
          respond(msg.id!, handleSignatureHelp(msg.params));
          break;
        default:
          if (msg.id !== undefined) respond(msg.id, null);
      }
    } catch (e) {
      if (msg.id !== undefined) {
        emit({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e) } });
      }
    }
  }

  return {
    handle,
    getDocument: (uri) => documents.get(uri),
  };
}

// ── Chain extraction ────────────────────────────────────────────────────────

const ID_CHAR = /[A-Za-z0-9_]/;

interface Chain {
  parts: string[];
  trailingDot: boolean;
  wordStart: number;
}

/**
 * Walk backwards from the cursor over `ident (call)? (.ident (call)?)*` to
 * build the dotted chain being typed. Balanced `(...)` and `[...]` trailers
 * are skipped — so `hub.ports.A.device().` yields the same chain as
 * `hub.ports.A.device.`. The resolver knows how to follow return types.
 */
export function chainAt(line: string, col: number): Chain {
  let i = col;
  const parts: string[] = [];
  let cur = "";
  while (i > 0 && ID_CHAR.test(line[i - 1])) {
    i--;
    cur = line[i] + cur;
  }
  const wordStart = i;
  const trailingDot = cur === "" && i > 0 && line[i - 1] === ".";
  if (cur) parts.unshift(cur);
  while (i > 0 && line[i - 1] === ".") {
    i--;
    // Skip balanced call / subscript trailer(s) that precede the identifier.
    while (i > 0 && (line[i - 1] === ")" || line[i - 1] === "]")) {
      const open = line[i - 1] === ")" ? "(" : "[";
      const close = line[i - 1];
      let depth = 1;
      let j = i - 2;
      while (j >= 0 && depth > 0) {
        if (line[j] === close) depth++;
        else if (line[j] === open) depth--;
        j--;
      }
      if (depth !== 0) return { parts, trailingDot, wordStart };
      i = j + 1;
    }
    let seg = "";
    while (i > 0 && ID_CHAR.test(line[i - 1])) {
      i--;
      seg = line[i] + seg;
    }
    if (!seg) break;
    parts.unshift(seg);
  }
  return { parts, trailingDot, wordStart };
}

function completionItemKind(kind: StubSymbol["kind"]): number {
  switch (kind) {
    case "module": return 9;
    case "class": return 7;
    case "function": return 3;
    case "method": return 2;
    case "attribute": return 5;
    case "variable": return 6;
  }
}

const ASSIGN_RHS_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/;
const IMPORT_AS_RE = /^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/;
const FROM_IMPORT_RE = /^\s*from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(.+)$/;
const IF_ISINSTANCE_RE = /^(\s*)if\s+isinstance\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)\s*:/;
const IF_NOT_ISINSTANCE_RE = /^(\s*)if\s+not\s+isinstance\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)\s*:/;
const EXIT_STMT_RE = /^\s*(raise\b|return\b|continue\b|break\b|sys\.exit\s*\(|exit\s*\(|os\._exit\s*\()/;

export interface Narrowing {
  name: string;
  chain: string[];
  startLine: number;
  endLine: number;
}

export interface DocScope {
  globals: Map<string, string[]>;
  narrowings: Narrowing[];
}

function lookupBinding(scope: DocScope | undefined, name: string, line: number): string[] | undefined {
  if (!scope) return undefined;
  // Innermost-narrowing-first: iterate narrowings that cover this line
  // (deeper ones appear later after their outer siblings — reversed).
  for (let i = scope.narrowings.length - 1; i >= 0; i--) {
    const n = scope.narrowings[i];
    if (n.name === name && line >= n.startLine && line <= n.endLine) return n.chain;
  }
  return scope.globals.get(name);
}

/** Drop balanced `()` and `[]` trailers so `A.device()` collapses to `A.device`. */
function stripCalls(s: string): string {
  let out = "";
  let depth = 0;
  for (const c of s) {
    if (c === "(" || c === "[") { depth++; continue; }
    if (c === ")" || c === "]") { if (depth > 0) depth--; continue; }
    if (depth === 0) out += c;
  }
  return out;
}

/**
 * Scan a document for file-scope name bindings and position-scoped
 * `isinstance` narrowings. Supports:
 *   - `X = <dotted>`             (assignment, call trailers stripped)
 *   - `import M as A`
 *   - `from M import A [as B]`
 *   - `if isinstance(name, Type):` block — `name` narrows to `Type` inside
 *
 * Deliberately shallow. Good enough for the block-generated shape and casual
 * hand-written scripts. Extend `narrowings` semantics if we ever add
 * `assert isinstance(x, T)` or `elif` chains.
 */
export function scanScopes(source: string): DocScope {
  const globals = new Map<string, string[]>();
  const narrowings: Narrowing[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s*#.*$/, "");
    let m: RegExpMatchArray | null;

    if ((m = line.match(IMPORT_AS_RE))) {
      globals.set(m[2], m[1].split("."));
      continue;
    }
    if ((m = line.match(FROM_IMPORT_RE))) {
      const mod = m[1].split(".");
      for (const part of m[2].split(",")) {
        const seg = part.trim();
        if (!seg) continue;
        const asMatch = seg.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        if (asMatch) globals.set(asMatch[2], [...mod, asMatch[1]]);
        else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) globals.set(seg, [...mod, seg]);
      }
      continue;
    }
    if ((m = raw.match(IF_ISINSTANCE_RE))) {
      const indent = m[1].length;
      const name = m[2];
      const type = m[3];
      const endLine = findBlockEnd(lines, i + 1, indent);
      narrowings.push({
        name,
        chain: type.split("."),
        startLine: i + 1,
        endLine,
      });
      continue;
    }
    // `if not isinstance(x, T): raise/return/...` — post-guard narrowing.
    // Everything after the block up to the enclosing scope's end sees `x`
    // as `T`, because control can only continue there when the guard held.
    if ((m = raw.match(IF_NOT_ISINSTANCE_RE))) {
      const indent = m[1].length;
      const name = m[2];
      const type = m[3];
      const bodyEnd = findBlockEnd(lines, i + 1, indent);
      if (blockAlwaysExits(lines, i + 1, bodyEnd, indent)) {
        const scopeEnd = findScopeEnd(lines, bodyEnd + 1, indent);
        narrowings.push({
          name,
          chain: type.split("."),
          startLine: bodyEnd + 1,
          endLine: scopeEnd,
        });
      }
      continue;
    }
    if ((m = line.match(ASSIGN_RHS_RE))) {
      const stripped = stripCalls(m[2]).trim();
      if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(stripped)) {
        globals.set(m[1], stripped.split("."));
      }
    }
  }
  return { globals, narrowings };
}

/**
 * Given the line following an `if`/`for`/etc header at `outerIndent`, find
 * the last line of that indented block. Blank lines don't terminate the
 * block; a dedent to `outerIndent` or less does.
 */
function findBlockEnd(lines: string[], from: number, outerIndent: number): number {
  let last = from;
  for (let i = from; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    const ind = ln.match(/^\s*/)![0].length;
    if (ind <= outerIndent) return last;
    last = i;
  }
  return lines.length - 1;
}

/**
 * True when every code path through `[from, to]` exits the enclosing scope
 * (raise / return / continue / break / sys.exit / exit / os._exit) at the
 * block's first indent level. We check any first-level statement matching
 * an exit — good enough for the guard pattern, no full CFG needed.
 */
function blockAlwaysExits(lines: string[], from: number, to: number, outerIndent: number): boolean {
  let firstInd = -1;
  for (let i = from; i <= to; i++) {
    const ln = lines[i];
    if (!ln?.trim()) continue;
    const ind = ln.match(/^\s*/)![0].length;
    if (ind <= outerIndent) continue;
    if (firstInd < 0) firstInd = ind;
    if (ind === firstInd && EXIT_STMT_RE.test(ln)) return true;
  }
  return false;
}

/**
 * From `from`, return the last line at indent `>= scopeIndent + 1`. Blank
 * lines don't terminate. Used to extend post-guard narrowings to the end of
 * the enclosing function / module (nested `def`s at deeper indent stay
 * inside the scope, so their bodies inherit the narrowing).
 */
function findScopeEnd(lines: string[], from: number, scopeIndent: number): number {
  let last = Math.max(from - 1, 0);
  for (let i = from; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    const ind = ln.match(/^\s*/)![0].length;
    if (ind < scopeIndent) return last;
    last = i;
  }
  return lines.length - 1;
}

/** Back-compat alias (older tests). */
export function scanBindings(source: string): Map<string, string[]> {
  return scanScopes(source).globals;
}

