import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary border border-transparent hover:bg-primary-hover",
  accent: "bg-accent text-on-accent border border-line-strong hover:border-ink",
  secondary: "bg-transparent text-ink border border-line-strong hover:bg-surface hover:border-ink",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-surface",
};
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-sm",
  md: "min-h-10 px-4 text-[0.9375rem]",
};

/** Class string for anything that should look like a button (e.g. a Next <Link>). */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "ss-forced-border inline-flex items-center justify-center gap-2 rounded-control font-medium",
    "transition-colors no-underline disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...rest} />;
});
