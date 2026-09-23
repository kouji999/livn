import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

/**
 * Button.
 *
 * Five variants, three sizes, and a loading state that preserves width so the
 * layout does not jump when an action starts. Renders as `<a>` when `href` is
 * given so navigation stays a real link (middle-click, keyboard, screen
 * readers all behave correctly).
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink border border-transparent hover:bg-accent-hover active:bg-accent",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-sunken active:bg-surface-sunken",
  ghost:
    "bg-transparent text-ink-muted border border-transparent hover:bg-surface-sunken hover:text-ink",
  danger:
    "bg-transparent text-negative border border-border-strong hover:bg-negative-soft hover:border-negative",
  quiet:
    "bg-transparent text-ink-faint border border-transparent hover:text-ink hover:bg-surface-sunken",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-sm",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-base gap-2 rounded-md",
};

const BASE =
  "inline-flex items-center justify-center font-medium select-none whitespace-nowrap " +
  "transition-colors duration-standard ease-standard " +
  "disabled:opacity-45 disabled:pointer-events-none";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    href?: never;
  };

export type ButtonLinkProps = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
  prefetch?: boolean;
  "aria-label"?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  // While loading the visible text is swapped for a spinner. The label is
  // preserved via `aria-label` so the control never becomes unnamed
  // mid-interaction, and the text node is visually hidden to avoid announcing
  // the same label twice.
  const explicitLabel = rest["aria-label"];
  const keepLabel = loading && !explicitLabel && typeof children === "string";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={keepLabel ? children : explicitLabel}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "lg" ? 16 : 14} />
      ) : (
        icon && <span className="shrink-0 [&>svg]:size-3.5">{icon}</span>
      )}
      <span className={cn(keepLabel && "sr-only")}>{children}</span>
      {iconRight && !loading && (
        <span className="shrink-0 [&>svg]:size-3.5">{iconRight}</span>
      )}
    </button>
  );
});

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  fullWidth,
  className,
  children,
  href,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {icon && <span className="shrink-0 [&>svg]:size-3.5">{icon}</span>}
      {children}
      {iconRight && <span className="shrink-0 [&>svg]:size-3.5">{iconRight}</span>}
    </Link>
  );
}

/** Square icon-only button. Requires an accessible label. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: Omit<ButtonProps, "icon" | "iconRight" | "fullWidth" | "children"> & {
  label: string;
  children?: ReactNode;
}) {
  const side = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9";
  return (
    <Button
      variant={variant}
      size={size}
      loading={loading}
      aria-label={label}
      title={label}
      className={cn(side, "gap-0 px-0", className)}
      {...rest}
    >
      {loading ? null : <span className="[&>svg]:size-4">{children}</span>}
    </Button>
  );
}
