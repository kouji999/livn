import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { getUserProfile } from "@/domains/auth/service";
import { formatFullDate, today } from "@/lib/date";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Pengaturan" };

/**
 * Settings.
 *
 * Grouped by what each setting actually affects, because that is what makes them
 * safe to change: a preference that alters how numbers are computed deserves a
 * different weight from one that only changes how they look.
 *
 * Account identity (email, password) is handled separately from presentation, so
 * a change to the display font cannot sit in the same list as a credential.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getUserProfile(user.id);
  const day = today(user.timeZone);

  return (
    <AppShell title="Pengaturan" subtitle={formatFullDate(day, user.locale)}>
      <SettingsView
        profile={{
          email: profile.email,
          displayName: profile.displayName,
          timeZone: profile.timeZone,
          locale: profile.locale,
          currency: profile.currency,
          weekStartsOn: profile.weekStartsOn,
          themePreference: profile.themePreference,
          createdAt: profile.createdAt.toISOString(),
        }}
      />
    </AppShell>
  );
}
