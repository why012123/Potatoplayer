import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  variant?: "glass" | "ghost" | "dark" | "soft";
  size?: "sm" | "md" | "lg";
  active?: boolean;
}

export function IconButton({
  children,
  label,
  className,
  variant = "glass",
  size = "md",
  active,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx("icon-button", `icon-button--${variant}`, `icon-button--${size}`, active && "is-active", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
