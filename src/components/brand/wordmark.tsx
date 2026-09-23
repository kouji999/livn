"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Wordmark.
 *
 * Two renderings of the same mark, chosen by the `href` prop:
 *
 *   • With `href`, it is a link. Use this everywhere the mark is a navigation
 *     target — the app shell and the auth pages both send the reader back to the
 *     landing page, which is the behaviour people expect from a logo.
 *   • Without, it is a plain span. The landing page uses this form, because a
 *     logo that links to the page you are already on is a dead control.
 *
 * Set as text rather than an image: it stays crisp at every density, adapts to
 * the theme without a second asset, and adds no request.
 */

type WordmarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** When set, the mark renders as a link. */
  href?: string;
  /** Accessible name for the link. Defaults to a sensible destination label. */
  label?: string;
};

const SIZES = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
} as const;

export function Wordmark({ className, size = "md", href, label }: WordmarkProps) {
  const content = (
    <>
      Livn
      <span
        aria-hidden
        className={cn(
          "inline-block size-[0.28em] rounded-full bg-accent",
          size === "lg" && "translate-y-[-0.02em]",
        )}
      />
    </>
  );

  const shared = cn(
    "inline-flex items-baseline gap-[0.1em] font-semibold tracking-[-0.02em] text-ink",
    SIZES[size],
    // A focus ring on a bare logo looks like an error, so the hover and focus
    // states are carried by opacity instead.
    href && "rounded-sm transition-opacity duration-fast hover:opacity-80",
    className,
  );

  if (href) {
    return (
      <Link href={href} aria-label={label ?? "Livn, ke halaman utama"} className={shared}>
        {content}
      </Link>
    );
  }

  return <span className={shared}>{content}</span>;
}
