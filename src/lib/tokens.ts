/**
 * Design token accessors.
 *
 * Domain records store semantic token *names* (from the database) rather than
 * hex values, so a colour change is a token change and nothing more. These
 * helpers turn those names into the CSS custom properties declared in
 * `src/styles/tokens.css`.
 *
 * An unknown token falls back to the accent rather than rendering nothing.
 */

export const COLORS = [
  "accent",
  "neutral",
  "positive",
  "negative",
  "warning",
  "info",
] as const;

export type ColorToken = (typeof COLORS)[number];

const TOKEN_TO_VAR: Record<ColorToken, { solid: string; soft: string }> = {
  accent: { solid: "var(--color-accent)", soft: "var(--color-accent-soft)" },
  neutral: { solid: "var(--color-ink-subtle)", soft: "var(--color-surface-sunken)" },
  positive: { solid: "var(--color-positive)", soft: "var(--color-positive-soft)" },
  negative: { solid: "var(--color-negative)", soft: "var(--color-negative-soft)" },
  warning: { solid: "var(--color-warning)", soft: "var(--color-warning-soft)" },
  info: { solid: "var(--color-info)", soft: "var(--color-info-soft)" },
};

export function isColorToken(value: string): value is ColorToken {
  return (COLORS as readonly string[]).includes(value);
}

export function colorVar(token: string | null | undefined): string {
  const key = token && isColorToken(token) ? token : "accent";
  return TOKEN_TO_VAR[key].solid;
}

export function colorSoftVar(token: string | null | undefined): string {
  const key = token && isColorToken(token) ? token : "accent";
  return TOKEN_TO_VAR[key].soft;
}

/**
 * A stable colour for records that have no explicit token — accounts,
 * categories and areas created before a colour was chosen still need to be
 * visually distinguishable.
 */
export function colorFromId(id: string): ColorToken {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}
