import { Fragment, isValidElement } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import styles from "./PropertyPanel.module.css";

/** Whether a node renders anything (looks through fragments and arrays). */
function hasContent(node: React.ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean" || node === "") return false;
  if (Array.isArray(node)) return node.some(hasContent);
  if (isValidElement<{ children?: React.ReactNode }>(node) && node.type === Fragment) return hasContent(node.props.children);
  return true;
}

/** Collapsible group of fields in a property panel; renders nothing when it has no content. */
export function PropertyGroup({ title, folded, onToggle, children }: {
  title: string;
  folded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  if (!hasContent(children)) return null;
  return (
    <section className={styles.group}>
      <button type="button" className={styles.groupHeader} onClick={onToggle} aria-expanded={!folded}>
        {folded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        {title}
      </button>
      {!folded && <div className={styles.groupBody}>{children}</div>}
    </section>
  );
}
