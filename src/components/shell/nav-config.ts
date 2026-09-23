import type { LucideIcon } from "lucide-react";
import {
  CalendarRange,
  LineChart,
  NotebookPen,
  Sun,
  Wallet,
} from "lucide-react";

/**
 * Primary navigation.
 *
 * Five destinations, chosen so every question the product answers has exactly
 * one home:
 *
 *   Today    - what should I do now?
 *   Plan     - what am I trying to accomplish?
 *   Money    - where is my money going?
 *   Progress - how am I actually doing?
 *   Journal  - what happened, and what did I learn?
 *
 * Anything that does not fit one of those five belongs inside one of them, not
 * in a sixth nav item.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Spoken by screen readers and shown on the collapsed rail. */
  description: string;
  icon: LucideIcon;
  /** Route prefixes that should keep this item highlighted. */
  match: string[];
};

export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/today",
    label: "Today",
    description: "Prioritas, kebiasaan dan uang hari ini",
    icon: Sun,
    match: ["/today"],
  },
  {
    href: "/plan",
    label: "Plan",
    description: "Area, tujuan, proyek dan tugas",
    icon: CalendarRange,
    match: ["/plan", "/areas", "/goals", "/projects", "/tasks"],
  },
  {
    href: "/money",
    label: "Money",
    description: "Akun, transaksi, anggaran dan tabungan",
    icon: Wallet,
    match: ["/money"],
  },
  {
    href: "/progress",
    label: "Progress",
    description: "Statistik, tren dan review",
    icon: LineChart,
    match: ["/progress", "/reviews"],
  },
  {
    href: "/journal",
    label: "Journal",
    description: "Catatan harian, peristiwa hidup dan linimasa",
    icon: NotebookPen,
    match: ["/journal", "/timeline"],
  },
];

export function isActivePath(pathname: string, item: NavItem): boolean {
  return item.match.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
