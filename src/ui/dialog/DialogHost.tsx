import { createPortal } from "react-dom";
import { DialogView } from "./DialogView";
import { useDialogStore } from "./store";

/** Mount once near the app root. */
export function DialogHost() {
  const stack = useDialogStore((s) => s.stack);
  if (stack.length === 0) return null;
  return createPortal(<>{stack.map((d) => <DialogView key={d.id} d={d} />)}</>, document.body);
}
