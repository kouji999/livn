"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/domains/auth/actions";
import { IconButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Account menu.
 *
 * Rendered as a native `<details>` element rather than a portal-based popover.
 * It gets keyboard support, outside-click dismissal and correct screen-reader
 * semantics for free, with no JavaScript state to get out of sync.
 */
export function AccountMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const result = await logoutAction({});
      if (!result.ok) {
        toast.error("Gagal keluar", result.error.message);
        return;
      }
      router.replace("/login");
    });
  }

  const initials = user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-md p-1 pr-2 transition-colors duration-fast hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
        aria-label="Menu akun"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-micro font-semibold text-accent">
          {initials || <UserRound className="size-3.5" />}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm text-ink-muted sm:inline">
          {user.displayName}
        </span>
      </summary>

      <div className="absolute right-0 top-full z-overlay mt-1.5 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-overlay">
        <div className="border-b border-border-subtle px-3.5 py-3">
          <p className="truncate text-sm font-medium text-ink">{user.displayName}</p>
          <p className="truncate text-xs text-ink-subtle">{user.email}</p>
        </div>

        <div className="p-1">
          <a
            href="/settings"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
          >
            <Settings className="size-3.5" />
            Pengaturan
          </a>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={pending}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
          >
            <LogOut className="size-3.5" />
            {pending ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </div>
    </details>
  );
}

/** Placeholder kept beside the menu so the header has a stable action slot. */
export function ShellActions({ children }: { children?: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

export { IconButton };
