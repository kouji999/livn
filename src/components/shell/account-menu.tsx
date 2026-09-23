"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/domains/auth/actions";
import { IconButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/brand/avatar";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Account menu.
 *
 * Rendered as a native `<details>` element rather than a portal-based popover.
 * It gets keyboard support, outside-click dismissal and correct screen-reader
 * semantics for free, with no JavaScript state to keep in sync.
 *
 * The avatar is drawn from the user's profile choice, so the mark at the bottom
 * of the sidebar matches the one on their profile page rather than being a
 * second, unrelated rendering of their initials.
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

  return (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-md p-1 pr-2 transition-colors duration-fast hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
        aria-label="Menu akun"
      >
        <Avatar
          name={user.displayName}
          style={user.avatarStyle}
          colorToken={user.avatarColor}
          iconName={user.avatarIcon}
          size="sm"
        />
        <span className="hidden max-w-[9rem] truncate text-sm text-ink-muted sm:inline">
          {user.displayName}
        </span>
      </summary>

      <div className="absolute right-0 top-full z-overlay mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-surface shadow-overlay">
        {/* The identity block links to the profile, so the place that shows who
            you are is also the place that edits it. */}
        <Link
          href="/settings/profile"
          className="flex items-center gap-3 border-b border-border-subtle px-3.5 py-3 transition-colors duration-fast hover:bg-surface-sunken"
        >
          <Avatar
            name={user.displayName}
            style={user.avatarStyle}
            colorToken={user.avatarColor}
            iconName={user.avatarIcon}
            size="md"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {user.displayName}
            </span>
            {user.headline ? (
              <span className="block truncate text-xs text-ink-subtle">{user.headline}</span>
            ) : (
              <span className="block truncate text-xs text-ink-subtle">{user.email}</span>
            )}
          </span>
        </Link>

        <div className="p-1">
          <Link
            href="/settings/profile"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
          >
            <UserRound className="size-3.5" />
            Profil
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
          >
            <Settings className="size-3.5" />
            Pengaturan
          </Link>

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
