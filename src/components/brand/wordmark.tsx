import { cn } from "@/lib/cn";

/**
 * Wordmark.
 *
 * Set as text rather than an image: it stays crisp at every density, adapts to
 * the theme without a second asset, and adds no request.
 */
export function Wordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
  };

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-[0.1em] font-semibold tracking-[-0.02em] text-ink",
        sizes[size],
        className,
      )}
    >
      Livn
      <span
        aria-hidden
        className={cn(
          "inline-block size-[0.28em] rounded-full bg-accent",
          size === "lg" && "translate-y-[-0.02em]",
        )}
      />
    </span>
  );
}
