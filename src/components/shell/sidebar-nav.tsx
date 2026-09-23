"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { PRIMARY_NAV, isActivePath } from "./nav-config";

/**
 * Sidebar navigation for tablet and desktop.
 *
 * The active item is marked with a left border and a weight change rather than
 * a filled pill: on a five-item nav, a block of colour is louder than the
 * information warrants.
 */
export function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      // A distinct name per landmark: two navigations both called "Navigasi
      // utama" are announced identically, so a screen-reader user cannot tell
      // which one they are in.
      aria-label="Navigasi samping"
      className={cn("flex flex-col gap-0.5", className)}
    >
      {PRIMARY_NAV.map((item) => {
        const active = isActivePath(pathname, item);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md py-2 pl-3 pr-2 text-sm",
              "transition-colors duration-fast ease-standard",
              active
                ? "bg-surface-sunken font-medium text-ink"
                : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-opacity duration-fast",
                active ? "bg-accent opacity-100" : "opacity-0",
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-accent" : "text-ink-faint group-hover:text-ink-subtle",
              )}
              strokeWidth={active ? 2 : 1.75}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Bottom tab bar for phones.
 *
 * Five items is the practical ceiling for a thumb-reachable bar, which is why
 * navigation was constrained to five in the first place.
 *
 * The background is fully opaque and the bar sits in normal flow rather than
 * floating over content: a translucent bar lets scrolled content show through
 * the labels, which reads as a rendering fault. It is the last child of the
 * page column, so it is simply the thing below the content.
 */
export function MobileTabBar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi tab"
      className={cn(
        "flex items-stretch border-t border-border bg-surface",
        // Respect the home indicator on iOS without a hard-coded inset.
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {PRIMARY_NAV.map((item) => {
        const active = isActivePath(pathname, item);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-micro",
              "transition-colors duration-fast ease-standard",
              active ? "text-accent" : "text-ink-subtle",
            )}
          >
            {/* A top rule marks the active tab without shifting the icon. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-4 top-0 h-0.5 rounded-full transition-opacity duration-fast",
                active ? "bg-accent opacity-100" : "opacity-0",
              )}
            />
            <Icon className="size-[18px]" strokeWidth={active ? 2 : 1.75} />
            <span className="truncate font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
