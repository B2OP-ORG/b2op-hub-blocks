// Stack of open dialogs (the imperative API in api.ts pushes, DialogHost renders).

import { create } from "zustand";

export type ButtonKind = "primary" | "danger" | "default";

export interface ChoiceButton<T extends string> {
  value: T;
  label: string;
  kind?: ButtonKind;
}

export interface DialogRequest {
  id: number;
  title: string;
  /** Body: plain text or React content. */
  body?: React.ReactNode;
  /** When set, shows a text input. */
  input?: { initial: string; placeholder?: string; selectStem?: boolean; validate?: (v: string) => string | null };
  /** When set, shows a clickable list; clicking an item resolves with its value. */
  list?: { value: string; label: string; detail?: string; current?: boolean }[];
  buttons: ChoiceButton<string>[];
  /** Value resolved on Escape / overlay click. */
  cancelValue: string;
  resolve: (r: { value: string; text: string }) => void;
}

interface DialogStore {
  stack: DialogRequest[];
  push: (d: DialogRequest) => void;
  pop: (id: number) => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  stack: [],
  push: (d) => set((s) => ({ stack: [...s.stack, d] })),
  pop: (id) => set((s) => ({ stack: s.stack.filter((d) => d.id !== id) })),
}));

let nextId = 1;

export function request(opts: Omit<DialogRequest, "id" | "resolve">): Promise<{ value: string; text: string }> {
  return new Promise((resolve) => {
    useDialogStore.getState().push({ ...opts, id: nextId++, resolve });
  });
}
