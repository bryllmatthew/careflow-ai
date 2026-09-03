import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";

/**
 * Pure redirect resolver. The real landing experiences live at /dashboard
 * (inside the (app) shell, Task 1.10) and /create-organization (Task 1.8).
 */
export default async function Home() {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (auth.memberships.length === 0) {
    redirect("/create-organization");
  }

  redirect("/dashboard");
}
