import { SectionTitle } from "./SectionTitle";
import styles from "./PanelHeader.module.css";

/** Title bar at the top of a sidebar tab; `children` are right-aligned actions. */
export function PanelHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <SectionTitle>{title}</SectionTitle>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
