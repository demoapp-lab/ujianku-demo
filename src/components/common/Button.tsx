import type { ReactNode } from "react";

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "brass";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
    brass: "btn-brass",
  }[variant];
  return (
    <button type="button" className={`${cls} ${className}`} {...rest}>
      {children}
    </button>
  );
}
