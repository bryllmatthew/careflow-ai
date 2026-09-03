/**
 * Placeholder root route.
 *
 * Task 1.7 replaces this with a redirect: authenticated users go to `/dashboard`,
 * unauthenticated users to `/login`, and users without an organization to
 * `/create-organization`.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">CareFlow AI</h1>
        <p className="mt-2 text-sm text-gray-500">Foundation scaffold. Phase 1 in progress.</p>
      </div>
    </main>
  );
}
