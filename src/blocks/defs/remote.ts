import * as Blockly from "blockly/core";
import { controlSymbols, findSymbol, indicatorSymbols } from "../../remote/registry";
import type { Role } from "../../remote/layout";

export const REMOTE_COLOUR = "330";

/**
 * Dropdown of the project's remote names (controls or indicators). Unlike a
 * plain dropdown it keeps any value — a program may name a control that the
 * layout doesn't define (yet); such names show as "name (not defined)".
 */
export class FieldRemoteName extends Blockly.FieldDropdown {
  readonly role: Role;

  constructor(role: Role, value?: string) {
    // getOptions() is overridden, so the generator passed here is never used.
    // (The base constructor already calls getOptions(), before `role` is set.)
    super(() => [["(none)", ""]]);
    this.role = role;
    if (value !== undefined) this.setValue(value);
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & { role?: Role; value?: string }): FieldRemoteName {
    return new FieldRemoteName(options.role === "indicator" ? "indicator" : "control", options.value);
  }

  private menuOptions(): Blockly.MenuOption[] {
    const syms = this.role === "indicator" ? indicatorSymbols() : controlSymbols();
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
    return !!v && !!findSymbol(this.role, v);
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
      const what = f.role === "indicator" ? "indicator" : "control";
      this.setWarningText(!v
        ? `Pick a remote ${what}.`
        : f.isDefined() ? null : `"${v}" is not a ${what} in the remote controller.`);
    });
  });
}

export const REMOTE_BLOCKS = [
  {
    type: "remote_get",
    message0: "remote %1",
    args0: [{ type: "field_remote_name", name: "NAME", role: "control" }],
    output: null,
    colour: REMOTE_COLOUR,
    extensions: ["remote_name_warning"],
    tooltip: "Current value of a control in the remote controller (0 until the app sends one).",
  },
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
