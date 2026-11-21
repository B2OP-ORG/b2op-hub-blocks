// Promise-based dialogs: `await showConfirm(...)` etc. Mount <DialogHost /> once.

import { request, type ChoiceButton } from "./store";

export async function showAlert(title: string, body?: React.ReactNode): Promise<void> {
  await request({ title, body, buttons: [{ value: "ok", label: "OK", kind: "primary" }], cancelValue: "ok" });
}

export async function showConfirm(
  title: string,
  body?: React.ReactNode,
  opts: { confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  const r = await request({
    title,
    body,
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "ok", label: opts.confirmLabel ?? "OK", kind: opts.danger ? "danger" : "primary" },
    ],
    cancelValue: "cancel",
  });
  return r.value === "ok";
}

export async function showPrompt(
  title: string,
  initial = "",
  opts: { body?: React.ReactNode; confirmLabel?: string; placeholder?: string; selectStem?: boolean; validate?: (v: string) => string | null } = {},
): Promise<string | null> {
  const r = await request({
    title,
    body: opts.body,
    input: { initial, placeholder: opts.placeholder, selectStem: opts.selectStem, validate: opts.validate },
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "ok", label: opts.confirmLabel ?? "OK", kind: "primary" },
    ],
    cancelValue: "cancel",
  });
  return r.value === "ok" ? r.text : null;
}

/** Arbitrary button set; resolves with the chosen value (or `cancelValue`). */
export async function showChoice<T extends string>(
  title: string,
  body: React.ReactNode,
  buttons: ChoiceButton<T>[],
  cancelValue: T,
): Promise<T> {
  const r = await request({ title, body, buttons, cancelValue });
  return r.value as T;
}

/** Pick one entry from a list. Resolves with its value, or null when cancelled. */
export async function showList(
  title: string,
  items: { value: string; label: string; detail?: string; current?: boolean }[],
  body?: React.ReactNode,
): Promise<string | null> {
  const r = await request({ title, body, list: items, buttons: [{ value: "\u0000cancel", label: "Cancel" }], cancelValue: "\u0000cancel" });
  return r.value === "\u0000cancel" ? null : r.value;
}

/** Choice dialog with an input, e.g. "New project" (name + Blocks/Python). */
export async function showPromptChoice<T extends string>(
  title: string,
  initial: string,
  buttons: ChoiceButton<T>[],
  cancelValue: T,
  opts: { body?: React.ReactNode; placeholder?: string; validate?: (v: string) => string | null } = {},
): Promise<{ value: T; text: string }> {
  const r = await request({ title, body: opts.body, input: { initial, placeholder: opts.placeholder, validate: opts.validate }, buttons, cancelValue });
  return { value: r.value as T, text: r.text };
}
