import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Tooltip and accessible label. */
  title: string;
  variant?: "toolbar" | "subtle";
  ref?: React.Ref<HTMLButtonElement>;
}

/** Icon-only button; `title` doubles as the aria-label. */
export function IconButton({ title, variant = "subtle", className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} title={title} aria-label={title} className={[styles.btn, styles[variant], className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
