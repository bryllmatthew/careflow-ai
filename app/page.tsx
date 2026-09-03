import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./(auth)/actions";

/**
 * Placeholder authenticated landing page.
 *
 * Task 1.10 replaces the body below with the real app shell / dashboard.
 * The redirect rules themselves (unauthenticated -> /login, no active
 * organization -> /create-organization) are the real behavior this task
 * delivers and will not change shape later.
 */
export default async function Home() {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (auth.memberships.length === 0) {
    redirect("/create-organization");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">CareFlow AI</h1>
        <p className="mt-2 text-sm text-gray-500">Signed in as {auth.email}.</p>
        <ul className="mt-4 text-sm text-gray-700">
          {auth.memberships.map((m) => (
            <li key={m.organizationId}>{m.organizationName}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-gray-500">
          The application shell lands in Task 1.10 — this page is a placeholder.
        </p>
        <form action={logoutAction} className="mt-6">
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </div>
    </main>
  );
}
