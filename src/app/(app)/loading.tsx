import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRows } from "@/components/ui/states";
import { StatStrip } from "@/components/layout/page";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Loading state for the authenticated shell.
 *
 * `loading.tsx` streams while a server component awaits its queries. Without it
 * a slow page shows nothing at all and the navigation feels broken; with it the
 * user sees the shape of what is coming.
 *
 * The skeleton deliberately mirrors the real layout — a stat strip, then cards
 * with headings — rather than being a generic spinner. A placeholder whose shape
 * matches the content makes the arrival feel like a fill-in rather than a
 * replacement, which is the whole point of the difference between the two.
 *
 * `AppShell` is reused so the header and sidebar do not flicker: only the page
 * body is a placeholder.
 */
export default function AppLoading() {
  return (
    <AppShell title="Memuat" subtitle="Menyiapkan data">
      <div className="space-y-5" role="status" aria-label="Memuat halaman">
        {/* Stat strip, matching the four-column rhythm used by the real pages. */}
        <StatStrip>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-16" rounded="rounded-md" />
            </div>
          ))}
        </StatStrip>

        <Card>
          {/*
            `asBlock` because the title and description are skeleton elements,
            which render as `<div>`. Putting a block element inside the default
            `<p>` is invalid HTML, and React reports it as a hydration mismatch:
            `<div> cannot be a descendant of <p>`.
          */}
          <CardHeader
            asBlock
            title={<Skeleton className="h-3.5 w-32" />}
            description={<Skeleton className="mt-1 h-2.5 w-48" />}
          />
          <div className="px-5 pb-5">
            <SkeletonRows rows={4} />
          </div>
        </Card>

        <Card>
          <CardHeader asBlock title={<Skeleton className="h-3.5 w-28" />} />
          <div className="space-y-3 px-5 pb-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full" rounded="rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
