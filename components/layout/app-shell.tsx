import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";

export function AppShell({
  visibleHrefs,
  navBadges,
  organizationName,
  userEmail,
  children,
}: {
  /** hrefs of nav items the current user may see, computed server-side by permission. */
  visibleHrefs: string[];
  /** href -> count, for nav items with outstanding work (e.g. unconfirmed online bookings). */
  navBadges?: Record<string, number>;
  organizationName: string;
  userEmail: string;
  children: ReactNode;
}) {
  return (
    // h-dvh + per-pane scrolling (rather than min-h-dvh + page scroll) is what
    // lets the sidebar stay a fixed floating panel while only the content
    // scrolls -- the reference layout's behaviour.
    <div className="flex h-dvh gap-3 p-3">
      {/* Desktop sidebar. Mobile gets the same nav inside Topbar's Sheet drawer
          rather than a second implementation. */}
      <aside className="bg-sidebar text-sidebar-foreground ring-foreground/[0.06] shadow-liquid hidden w-64 shrink-0 flex-col rounded-2xl ring-1 md:flex">
        <div className="flex h-16 shrink-0 items-center px-4">
          <Logo href="/dashboard" />
        </div>
        <SidebarNav visibleHrefs={visibleHrefs} badges={navBadges} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Topbar
          organizationName={organizationName}
          userEmail={userEmail}
          visibleHrefs={visibleHrefs}
          navBadges={navBadges}
        />
        <main className="min-h-0 flex-1 overflow-y-auto pb-2">{children}</main>
      </div>
    </div>
  );
}
