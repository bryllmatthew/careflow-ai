import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./(auth)/actions";

/**
 * Placeholder authenticated landing page.
 *
 * Task 1.8 replaces the body below with a redirect to /create-organization
 * (no organization yet) or /dashboard (has one) once onboarding exists.
 * Unauthenticated visitors are redirected to /login now, which is the real
 * behavior this task delivers.
 */
export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">CareFlow AI</h1>
        <p className="mt-2 text-sm text-gray-500">Signed in as {user.email}.</p>
        <p className="mt-1 text-sm text-gray-500">
          Organization creation lands in Task 1.8 — this page is a placeholder.
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
