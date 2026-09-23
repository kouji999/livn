import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Layout for every authenticated surface.
 *
 * Authentication is enforced here, once, rather than in each page. A page that
 * forgets to check cannot leak data because it never renders without a user.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <>{children}</>;
}
