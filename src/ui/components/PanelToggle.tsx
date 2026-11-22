import { IconButton } from "./IconButton";

/** Editor toolbar button that opens / closes the side panels on one side. */
export function PanelToggle({ open, onToggle, title, icon }: {
  open: boolean;
  onToggle: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <IconButton variant="toolbar" title={title} aria-pressed={open} onClick={onToggle}
      style={{ background: open ? "var(--p-active-bg)" : undefined }}>
      {icon}
    </IconButton>
  );
}
