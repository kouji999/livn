import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { Wordmark } from "@/components/brand/wordmark";
import { AccountMenu } from "./account-menu";
import { MobileTabBar, SidebarNav } from "./sidebar-nav";

/**
 * Application shell.
 *
 * Layout by breakpoint:
 *
 *   phone   - single column, fixed bottom tab bar, sticky compact header
 *   tablet  - icon rail on the left
 *   desktop - full sidebar with labels, wide content column
 *
 * The shell only provides chrome. It never fetches domain data beyond the
 * current user, so it cannot become a bottleneck as the product grows.
 */
export async function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex w-full max-w-[100rem]">
        {/* Sidebar: hidden on phones, icon rail on tablets, labelled on desktop. */}
        <aside className="sticky top-0 hidden h-dvh w-14 shrink-0 flex-col border-r border-border bg-surface px-2 py-4 md:flex lg:w-56 lg:px-3">
          <Link
            href="/today"
            className="mb-6 flex items-center px-1.5 lg:px-2"
            aria-label="Livn, ke halaman Today"
          >
            <Wordmark size="md" className="hidden lg:inline-flex" />
            <span
              aria-hidden
              className="inline-block size-5 rounded-md bg-accent lg:hidden"
            />
          </Link>

          <SidebarNav />

          <div className="mt-auto pt-4">
            <div className="hidden lg:block">
              <AccountMenu user={user} />
            </div>
            <div className="flex justify-center lg:hidden">
              <AccountMenu user={user} />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Page header. Sticky so the title and actions stay reachable. */}
          <header className="sticky top-0 z-header border-b border-border bg-canvas/85 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight text-ink">
                  {title}
                </h1>
                {subtitle && (
                  <div className="mt-0.5 truncate text-xs text-ink-subtle">{subtitle}</div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {actions}
                <div className="md:hidden">
                  <AccountMenu user={user} />
                </div>
              </div>
            </div>
          </header>

          <main
            id="main"
            className="flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pb-10"
          >
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>

          {/*
            The tab bar is the last row of the page column rather than a fixed
            overlay: an overlay hides the final rows of a page and lets content
            bleed through its translucent background.
          */}
          <div className="sticky bottom-0 z-header md:hidden">
            <MobileTabBar />
          </div>
        </div>
      </div>
    </div>
  );
}
