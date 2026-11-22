import { createContext } from "react";
import type { AssetRef } from "../../project/format";

/** Finds the project image an image widget's `src` points at (provided by the scene editor). */
export const SceneAssetContext = createContext<(src: string) => AssetRef | undefined>(() => undefined);
