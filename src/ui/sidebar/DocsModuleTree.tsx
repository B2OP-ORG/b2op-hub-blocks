import { ChevronDown, ChevronRight } from "lucide-react";
import { classesOf, type ApiModule } from "../../docs/apiModel";
import { ListRow, RowIcon, RowLabel } from "../components/ListRow";

/** A docs tree row: optional expand chevron, optional icon, wrapping label. */
export function DocRow({ depth = 0, icon, label, detail, onClick, onToggle, open, active }: {
  depth?: number;
  icon?: React.ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  onToggle?: () => void;
  open?: boolean;
  active?: boolean;
}) {
  return (
    <ListRow
      role="button"
      tabIndex={0}
      title={detail}
      depth={depth}
      indent={14}
      gap={4}
      active={active}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
    >
      <span
        style={{ width: 14, flexShrink: 0, display: "inline-flex", paddingTop: 2, color: "var(--p-dim-text)" }}
        onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      >
        {onToggle ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
      </span>
      {icon && <RowIcon top>{icon}</RowIcon>}
      <RowLabel>{label}</RowLabel>
    </ListRow>
  );
}

/** An API module with its submodules and classes (expandable). */
export function ModuleTree({ mod, mods, depth, expanded, toggle, go }: {
  mod: ApiModule;
  mods: Map<string, ApiModule>;
  depth: number;
  expanded: Set<string>;
  toggle: (k: string) => void;
  go: (id: string) => void;
}) {
  const classes = classesOf(mod);
  const hasKids = mod.children.length > 0 || classes.length > 0;
  const open = expanded.has(mod.name);
  return (
    <>
      <DocRow
        depth={depth}
        label={mod.title === mod.name ? mod.name : `${mod.title}`}
        detail={mod.name}
        onClick={() => go(`api:${mod.name}`)}
        onToggle={hasKids ? () => toggle(mod.name) : undefined}
        open={open}
      />
      {open && mod.children.map((c) => <ModuleTree key={c} mod={mods.get(c)!} mods={mods} depth={depth + 1} expanded={expanded} toggle={toggle} go={go} />)}
      {open && classes.map((c) => <DocRow key={c.name} depth={depth + 1} label={c.name} detail={`${mod.name}.${c.name}`} onClick={() => go(`api:${mod.name}#${c.name}`)} />)}
    </>
  );
}
