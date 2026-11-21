import { useApp } from "../../state/store";
import { showAlert, showPrompt } from "../dialog";
import { emptyScene, moduleNameProblem, withSceneHeader } from "../../scene/model";
import { sceneToPython } from "../../scene/codegen";
import { setCreateSceneHandler } from "../../scene/registry";

/** File content of a new, empty scene. */
export function newSceneContent(module: string): string {
  const doc = emptyScene();
  return withSceneHeader(doc, sceneToPython(doc, module));
}

/**
 * Ask for a scene name and add `<name>.py` (in `dir`) to the active project.
 * Returns the module path, or null when cancelled.
 */
export async function newSceneFlow(dir = "", open = true): Promise<string | null> {
  const st = useApp.getState();
  const taken = (n: string) => st.mfp.files.some((f) => f.name.toLowerCase() === `${dir ? dir + "/" : ""}${n}.py`.toLowerCase());
  let suggestion = "scene";
  for (let i = 2; taken(suggestion); i++) suggestion = `scene${i}`;
  const name = await showPrompt("New scene", suggestion, {
    body: "Programs use the scene with \"import <name>\" and \"<name>.show()\", so pick a short Python name.",
    placeholder: "menu",
    confirmLabel: "Create",
    selectStem: true,
    validate: (v) => moduleNameProblem(v.trim()) ?? (taken(v.trim()) ? `"${v.trim()}.py" already exists.` : null),
  });
  if (name === null) return null;
  const n = name.trim();
  const path = `${dir ? dir + "/" : ""}${n}.py`;
  const module = path.replace(/\.py$/, "").split("/").join(".");
  const [id] = useApp.getState().addFilesToProject(st.mfp.id, [{ name: path, content: newSceneContent(module) }], false);
  if (!id) {
    await showAlert("Can't create scene", `"${path}" could not be added.`);
    return null;
  }
  if (open) useApp.getState().openFile(id);
  return module;
}

// "Create scene…" in the block toolbox: add the scene without leaving the blocks file.
setCreateSceneHandler(() => newSceneFlow("", false));
