// `remote.pyi` for the editor's language server: the firmware stub plus one
// typed attribute per control in the project's remote controller layouts, so
// `remote.speed` completes and type-checks. Indicators are left out: reading
// one gives 0 (programs send them with remote.send()).

import { RemoteType } from "../device/protocol";
import { isAttrName, KIND_LABEL, type RemoteSymbol } from "./layout";

const PY_TYPE: Record<RemoteType, string> = {
  [RemoteType.Int]: "int",
  [RemoteType.Float]: "float",
  [RemoteType.Bool]: "bool",
  [RemoteType.Str]: "str",
};

export function remoteStubText(base: string, symbols: readonly RemoteSymbol[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const s of symbols) {
    if (s.role !== "control" || !isAttrName(s.name) || seen.has(s.name)) continue;
    seen.add(s.name);
    lines.push(`${s.name}: ${PY_TYPE[s.type]}`);
    lines.push(`"""${KIND_LABEL[s.kind]} \`\`${s.name}\`\` (id ${s.id}) in ${s.file.replace(/"/g, "'")}."""`);
  }
  if (!lines.length) return base;
  return `${base.replace(/\s*$/, "")}\n\n# --- controls from the project's remote controller ---\n\n${lines.join("\n")}\n`;
}
