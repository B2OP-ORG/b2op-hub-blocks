import * as Blockly from "blockly/core";
import { controlSymbols, findSymbol, indicatorSymbols } from "../../remote/registry";
import type { RemoteSymbol, Role } from "../../remote/layout";
import { REMOTE_GET_BLOCK, remoteValueKind, type RemoteValueKind } from "../remoteKinds";

export const REMOTE_COLOUR = "330";

const KIND_LABEL: Record<RemoteValueKind, string> = { number: "number", bool: "on/off", text: "text" };

/**
 * Dropdown of the project's remote names (controls or indicators). Unlike a
 * plain dropdown it keeps any value — a program may name a control that the
 * layout doesn't define (yet); such names show as "name (not defined)".
 */
export class FieldRemoteName extends Blockly.FieldDropdown {
  readonly role: Role;
  /** Controls only: the value kind this field lists (others count as not defined). */
  readonly valueKind?: RemoteValueKind;

  constructor(role: Role, value?: string, valueKind?: RemoteValueKind) {
    // getOptions() is overridden, so the generator passed here is never used.
    // (The base constructor already calls getOptions(), before `role` is set.)
    super(() => [["(none)", ""]]);
    this.role = role;
    this.valueKind = valueKind;
    // The base constructor picked its default before role / kind were set.
    this.setValue(value ?? this.symbols()[0]?.name ?? "");
  }

  static override fromJson(
    options: Blockly.FieldDropdownFromJsonConfig & { role?: Role; value?: string; valueKind?: RemoteValueKind },
  ): FieldRemoteName {
    return new FieldRemoteName(options.role === "indicator" ? "indicator" : "control", options.value, options.valueKind);
  }

  private symbols(): RemoteSymbol[] {
    const syms = this.role === "indicator" ? indicatorSymbols() : controlSymbols();
    return this.valueKind ? syms.filter((s) => remoteValueKind(s.type) === this.valueKind) : syms;
  }

  /** Control with this name but of another value kind (wrong reporter block). */
  otherKindSymbol(): RemoteSymbol | undefined {
    const v = this.getValue();
    if (!v || !this.valueKind) return undefined;
    const s = findSymbol(this.role, v);
    return s && remoteValueKind(s.type) !== this.valueKind ? s : undefined;
  }

  private menuOptions(): Blockly.MenuOption[] {
    const syms = this.symbols();
    const opts: Blockly.MenuOption[] = syms.map((s) => [s.name, s.name]);
    const cur = this.getValue();
    if (cur && !syms.some((s) => s.name === cur)) opts.push([`${cur} (not defined)`, cur]);
    if (!opts.length) opts.push(["(none)", ""]);
    return opts;
  }

  // Options depend on the registry and the current value: never cache.
  override getOptions(): Blockly.MenuOption[] {
    return this.menuOptions();
  }

  // Text follows the registry, so a name that becomes (un)defined re-labels on rerender.
  protected override getText_(): string | null {
    const v = this.getValue();
    if (!v) return "(none)";
    return this.isDefined() ? v : `${v} (not defined)`;
  }

  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === "string" ? newValue : null;
  }

  /** Whether the current name is defined in the project's layouts. */
  isDefined(): boolean {
    const v = this.getValue();
    return !!v && this.symbols().some((s) => s.name === v);
  }
}

let fieldRegistered = false;
export function registerRemoteField(): void {
  if (fieldRegistered) return;
  fieldRegistered = true;
  Blockly.fieldRegistry.register("field_remote_name", FieldRemoteName);
  // Warn on names the layouts don't define (still allowed).
  Blockly.Extensions.register("remote_name_warning", function (this: Blockly.Block) {
    this.setOnChange(function (this: Blockly.Block) {
      if (this.isInFlyout) return;
      const f = this.getField("NAME");
      if (!(f instanceof FieldRemoteName)) return;
      const v = f.getValue();
      const what = f.role === "indicator" ? "indicator" : f.valueKind ? `${KIND_LABEL[f.valueKind]} control` : "control";
      const other = f.otherKindSymbol();
      this.setWarningText(!v
        ? `Pick a remote ${what}.`
        : f.isDefined() ? null
        : other ? `"${v}" is a ${KIND_LABEL[remoteValueKind(other.type)]} control: use the matching remote block.`
        : `"${v}" is not a ${what} in the remote controller.`);
    });
  });
}

export const REMOTE_BLOCKS = [
  ...(Object.entries(REMOTE_GET_BLOCK) as [RemoteValueKind, string][]).map(([kind, type]) => ({
    type,
    message0: "remote %1",
    args0: [{ type: "field_remote_name", name: "NAME", role: "control", valueKind: kind }],
    output: kind === "bool" ? "Boolean" : kind === "text" ? "String" : "Number",
    colour: REMOTE_COLOUR,
    extensions: ["remote_name_warning"],
    tooltip: `Current value of a ${KIND_LABEL[kind]} control in the remote controller.`,
  })),
  {
    type: "remote_set_indicator",
    message0: "set indicator %1 to %2",
    args0: [
      { type: "field_remote_name", name: "NAME", role: "indicator" },
      { type: "input_value", name: "VALUE" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: REMOTE_COLOUR,
    extensions: ["remote_name_warning"],
    tooltip: "Show a value on an indicator in the remote controller.",
  },
] as const;
