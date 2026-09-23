import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Surface primitives.
 *
 * The product deliberately leans on borders rather than shadows for
 * separation; shadows are reserved for things that genuinely float above the
 * page (menus, modals). This keeps a dense screen from turning into a pile of
 * elevated cards.
 */

export function Card({
  className,
  children,
  as: Tag = "section",
  interactive,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "aside";
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border bg-surface",
        interactive &&
          "transition-colors duration-standard ease-standard hover:border-border-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  size = "md",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4",
        size === "sm" ? "px-4 py-3" : "px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function CardBody({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return <div className={cn(padded && "px-5 pb-5", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <footer
      className={cn(
        "border-t border-border-subtle px-5 py-3 text-xs text-ink-subtle",
        className,
      )}
    >
      {children}
    </footer>
  );
}

/**
 * Section heading used between cards on a page. Smaller than a card title
 * because it labels a group, not a container.
 */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Divider that reads as a subtler boundary than a full-strength border. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border-subtle", className)} />;
}
