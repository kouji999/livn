import { cn } from "@/lib/cn";
import { colorSoftVar, colorVar } from "@/lib/tokens";
import { resolveIcon } from "@/lib/icons";
import type { LucideProps } from "lucide-react";

/**
 * Record glyph.
 *
 * Areas, categories and accounts each carry a colour token and an icon name.
 * Rendering them through one component keeps the visual weight identical
 * wherever a record appears in a list.
 */
export function RecordIcon({
  icon,
  token,
  size = "md",
  className,
  strokeWidth = 1.75,
}: {
  icon?: string | null;
  token?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = resolveIcon(icon);

  const box = {
    sm: "size-6 rounded-sm",
    md: "size-7 rounded-md",
    lg: "size-9 rounded-lg",
  }[size];

  const glyph = {
    sm: 13,
    md: 14,
    lg: 17,
  }[size];

  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center", box, className)}
      style={{ backgroundColor: colorSoftVar(token), color: colorVar(token) }}
    >
      <Icon size={glyph} strokeWidth={strokeWidth} />
    </span>
  );
}

export type { LucideProps };
