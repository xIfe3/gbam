import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = {
  variant: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  href?: string;
  children: React.ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

const variants = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border-brand text-brand hover:bg-brand-tint border-2 bg-white",
  ghost: "text-brand hover:bg-brand-tint bg-transparent",
};

const sizes = {
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-7 text-base",
};

// The one button style for the whole site. min-h-11 = 44px tap target; the focus ring
// is visible on keyboard focus (focus-visible) for every variant.
export function Button({ variant, size = "md", href, children, ...rest }: ButtonProps) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${variants[variant]} ${sizes[size]}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
