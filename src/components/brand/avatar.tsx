import { cn } from "@/lib/cn";
import { colorSoftVar, colorVar } from "@/lib/tokens";
import { resolveIcon } from "@/lib/icons";

/**
 * Avatar.
 *
 * Three renderings, chosen by `style`:
 *
 *   • `initials`  the first letters of the display name, on a soft tint. Reads as
 *                 personal and needs no image.
 *   • `icon`      a chosen glyph on a soft tint.
 *   • `solid`     a filled colour with the initials in the inverse ink.
 *
 * No uploaded images. An avatar file would require object storage, MIME
 * validation, size limits and a deletion path — a meaningful amount of surface
 * for a decoration. This covers the same need with none of it, and the schema
 * records the choice so adding uploads later does not invalidate anything.
 *
 * The generated initials are also what a screen reader announces, so the
 * component is not marked `aria-hidden`: a name is real information.
 */

export type AvatarStyle = "initials" | "icon" | "solid";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  style = "initials",
  colorToken = "accent",
  iconName,
  size = "md",
  className,
  /** Announce the name alongside the initials. Off in the shell, where the name
   *  is already rendered as text beside it and repeating it is noise. */
  labelled = false,
}: {
  name: string;
  style?: string;
  colorToken?: string;
  iconName?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  labelled?: boolean;
}) {
  const box = {
    xs: "size-6 text-micro",
    sm: "size-7 text-micro",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
    xl: "size-16 text-lg",
  }[size];

  const glyphSize = { xs: 12, sm: 13, md: 16, lg: 20, xl: 26 }[size];

  const resolvedStyle: AvatarStyle =
    style === "solid" || style === "icon" ? style : "initials";

  const solid = resolvedStyle === "solid";
  // A glyph replaces the initials only in the `icon` style. In `initials` and
  // `solid` the letters carry the identity; mixing a glyph into either would make
  // the three styles hard to tell apart at a glance.
  const showsIcon = resolvedStyle === "icon" && Boolean(iconName);
  const Icon = resolveIcon(iconName);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        box,
        className,
      )}
      style={{
        backgroundColor: solid ? colorVar(colorToken) : colorSoftVar(colorToken),
        color: solid ? "var(--color-ink-inverse)" : colorVar(colorToken),
      }}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {showsIcon ? (
        <Icon size={glyphSize} strokeWidth={1.9} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
