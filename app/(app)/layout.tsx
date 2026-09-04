import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getPermissionSet } from "@/lib/auth/require-permission";
import { ALL_NAV_ITEMS } from "@/lib/navigation";
import { AppShell } from "@/components/layout/app-shell";

/**
 * The authenticated shell for every real feature route. Frontend permission
 * filtering here is UX only, never a security boundary
 * (docs/AUTHORIZATION.md section 19) -- each page still calls
 * requirePermission() itself once it does real data access; hiding a nav
 * item just keeps someone from being routed somewhere they'd immediately
 * hit a wall.
 *
 * Current-organization resolution: MVP assumes one active org per user with
 * no switcher (CLAUDE.md "Deliberate deviations"), so this always takes the
 * first active membership. A multi-org user with a real switcher is future
 * work, not a Phase 1 gap -- organization_memberships already supports it.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const currentOrg = auth.memberships[0];
  if (!currentOrg) {
    redirect(auth.hasAnyMembership ? "/no-access" : "/create-organization");
  }

  const permissions = await getPermissionSet(currentOrg.organizationId);

  // Only plain strings cross into the Client Components below -- a
  // LucideIcon is a function, and React Server Components cannot serialize a
  // function reference across the server/client boundary. SidebarNav/Topbar
  // import the icon-bearing NAVIGATION config directly instead; this is just
  // "which hrefs may this user see".
  const visibleHrefs = ALL_NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    const required = Array.isArray(item.permission) ? item.permission : [item.permission];
    return required.some((p) => permissions.has(p));
  }).map((item) => item.href);

  return (
    <AppShell
      visibleHrefs={visibleHrefs}
      organizationName={currentOrg.organizationName}
      userEmail={auth.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
