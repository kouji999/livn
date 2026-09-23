import { cn } from "@/lib/cn";

/**
 * Spinner.
 *
 * Reduced-motion users get a static dot instead of a rotating ring — a
 * spinning element is exactly the kind of motion that preference exists to
 * suppress, and a still indicator still communicates "working".
 */
export function Spinner({
  size = 14,
  className,
  label = "Memuat",
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="block size-full rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
        style={{ borderWidth: Math.max(1.5, size / 8) }}
      />
    </span>
  );
}
