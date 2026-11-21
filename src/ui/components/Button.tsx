import styles from "./Button.module.css";

export type ButtonVariant = "default" | "primary" | "danger" | "dangerSoft" | "muted";
export type ButtonSize = "md" | "sm" | "xs";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon shown before the label. */
  icon?: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

/** Text button in the app's standard variants. */
export function Button({ variant = "default", size = "md", icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={[styles.btn, styles[size], styles[variant], className].filter(Boolean).join(" ")} {...rest}>
      {icon}
      {children}
    </button>
  );
}
