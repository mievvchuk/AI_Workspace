import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-[0_1px_2px_rgb(var(--shadow-color)/0.12)] hover:bg-accent-hover disabled:bg-hover disabled:text-subtle disabled:shadow-none disabled:opacity-100",
  secondary: "bg-hover text-fg hover:bg-line",
  outline: "border border-line bg-surface text-fg hover:border-line-hover hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-fg",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-base gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity,transform,box-shadow,filter] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline" | "primary";
  tooltip?: boolean;
  shortcut?: string;
}

const iconSizes = { sm: "size-8 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4", lg: "size-10 [&_svg]:size-[18px]" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", tooltip = true, shortcut, className, children, ...props },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] duration-150 active:scale-95 disabled:opacity-40 disabled:active:scale-100",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "outline" && "border border-line text-muted hover:border-line-hover hover:text-fg",
        variant === "primary" && "bg-accent text-on-accent hover:bg-accent-hover disabled:bg-hover disabled:text-subtle disabled:opacity-100",
        iconSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
  return tooltip ? <Tooltip content={label} shortcut={shortcut}>{btn}</Tooltip> : btn;
});
