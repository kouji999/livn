import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { getUserProfile } from "@/domains/auth/service";
import { db } from "@/lib/db";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profil" };

/**
 * Profile.
 *
 * What the account says about itself. Every field here is optional and purely
 * descriptive — nothing on this page changes how a record is stored, grouped or
 * totalled. Settings owns those.
 *
 * The page also shows a small set of facts about the account that cannot be
 * edited, because seeing them is useful and hiding them would be worse: when the
 * account was created, how many sessions are active, and when it was last used.
 */
export default async function ProfilePage() {
  const user = await requireUser();

  const [profile, sessionCount, activeSessions] = await Promise.all([
    getUserProfile(user.id),
    db.session.count({ where: { userId: user.id } }),
    db.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <AppShell title="Profil" subtitle={profile.email}>
      <ProfileView
        profile={{
          email: profile.email,
          displayName: profile.displayName,
          headline: profile.headline,
          bio: profile.bio,
          location: profile.location,
          avatarStyle: profile.avatarStyle,
          avatarColor: profile.avatarColor,
          avatarIcon: profile.avatarIcon,
          createdAt: profile.createdAt.toISOString(),
          lastSeenAt: profile.lastSeenAt ? profile.lastSeenAt.toISOString() : null,
        }}
        sessions={{ total: sessionCount, active: activeSessions }}
      />
    </AppShell>
  );
}
