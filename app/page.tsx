import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("organization_id, status, organizations(name)")
    .eq("status", "active");

  if (!memberships || memberships.length === 0) {
    redirect("/create-organization");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">CareFlow AI</h1>
        <p className="mt-2 text-sm text-gray-500">Signed in as {user.email}.</p>
        <ul className="mt-4 text-sm text-gray-700">
          {memberships.map((m) => (
            <li key={m.organization_id}>{m.organizations?.name}</li>
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
