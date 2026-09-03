import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";

/**
 * Pure redirect resolver. The real landing experiences live at /dashboard
 * (inside the (app) shell, Task 1.10) and /create-organization (Task 1.8).
 * A user with memberships but none active (every one suspended or removed)
 * goes to /no-access instead -- otherwise they'd see /create-organization's
 * "create your organization" copy right after being locked out of one.
 */
export default async function Home() {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (auth.memberships.length === 0) {
    redirect(auth.hasAnyMembership ? "/no-access" : "/create-organization");
  }

  redirect("/dashboard");
}
