import type { ReactNode } from "react";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";

export function AppShell({
  visibleHrefs,
  organizationName,
  userEmail,
  children,
}: {
  /** hrefs of nav items the current user may see, computed server-side by permission. */
  visibleHrefs: string[];
  organizationName: string;
  userEmail: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar. Mobile gets the same nav inside Topbar's Sheet drawer
          rather than a second implementation. */}
      <aside className="bg-sidebar text-sidebar-foreground hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 shrink-0 items-center border-b px-4 text-sm font-semibold">
          CareFlow AI
        </div>
        <SidebarNav visibleHrefs={visibleHrefs} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          organizationName={organizationName}
          userEmail={userEmail}
          visibleHrefs={visibleHrefs}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
