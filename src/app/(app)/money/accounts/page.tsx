import { redirect } from "next/navigation";

/**
 * Accounts index.
 *
 * The overview at `/money` already lists every account with its derived balance
 * and the form to add one, so a second listing would be two screens showing the
 * same thing. Redirect keeps the URL meaningful for anyone who types it.
 */
export default function AccountsIndexPage() {
  redirect("/money");
}
