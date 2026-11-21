// Current project's scenes, shared with code that must not import the app
// store (block fields / generators also run headless in tests). The app keeps
// it in sync with the project's scene files (see ./sync.ts).

import type { SceneKind } from "./model";

export interface SceneWidgetInfo {
  name: string;
  kind: SceneKind;
}

export interface SceneInfo {
  /** Python module path, e.g. "menu" or "screens.menu". */
  module: string;
  /** Project file id / path. */
  fileId: string;
  path: string;
  widgets: SceneWidgetInfo[];
}

let scenes: SceneInfo[] = [];
let key = "";
const listeners = new Set<() => void>();

export function sceneList(): readonly SceneInfo[] {
  return scenes;
}

export function findScene(module: string): SceneInfo | undefined {
  return scenes.find((s) => s.module === module);
}

export function findSceneWidget(module: string, name: string): SceneWidgetInfo | undefined {
  return findScene(module)?.widgets.find((w) => w.name === name);
}

/** Replace the scene list; listeners run only when it actually changed. */
export function setScenes(next: SceneInfo[]): void {
  const k = JSON.stringify(next);
  if (k === key) return;
  key = k;
  scenes = next;
  for (const l of listeners) l();
}

export function onScenesChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * "Create scene…" in the block toolbox. Set by the UI (it needs dialogs and
 * the store); resolves to the new module name or null.
 */
let createHandler: (() => Promise<string | null>) | null = null;

export function setCreateSceneHandler(h: typeof createHandler): void {
  createHandler = h;
}

export function createScene(): Promise<string | null> {
  return createHandler ? createHandler() : Promise.resolve(null);
}
