import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import LandingPage from "./(marketing)/landing";

/**
 * Root route.
 *
 * Anyone already signed in goes straight to their working surface, because the
 * explanation on the landing page is for people who have not seen the product
 * yet. Everyone else gets that explanation rather than a bare password prompt.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/today");

  // The route group cannot own `/` on its own while this file exists, so the
  // landing component is rendered from here. Query parameters are forwarded so
  // the landing page can receive them when it eventually uses one.
  void searchParams;

  return <LandingPage />;
}
