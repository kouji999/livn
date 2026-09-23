import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class name composition.
 *
 * `clsx` handles conditional joins; `tailwind-merge` resolves conflicts so a
 * component's own class can still be overridden by a caller without needing
 * `!important`. Every component uses this instead of string concatenation.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
