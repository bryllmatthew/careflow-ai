"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAVIGATION } from "@/lib/navigation";

/**
 * Imports the full nav config (icons included) directly rather than
 * receiving it as a prop from the server: a LucideIcon is a component
 * function, and React Server Components cannot serialize a function
 * reference across the server/client boundary ("Functions cannot be passed
 * directly to Client Components"). Only the plain-string list of hrefs the
 * current user may see is computed server-side (app/(app)/layout.tsx) and
 * passed down -- everything about how to RENDER an item stays client-side.
 */
export function SidebarNav({
  visibleHrefs,
  badges,
  onNavigate,
}: {
  visibleHrefs: string[];
  /** href -> outstanding-item count, rendered as a chip on the item. */
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visible = new Set(visibleHrefs);

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => visible.has(item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-col gap-5 overflow-y-auto px-3 pt-1 pb-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-muted-foreground px-3 pb-1.5 text-[0.6875rem] font-medium tracking-wider uppercase">
            {section.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              const badge = badges?.[item.href] ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-muted hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{item.title}</span>
                  {badge > 0 && (
                    /* The count is inside the link's accessible name via the
                       sr-only text, so a screen reader hears "Appointments, 3
                       awaiting confirmation" rather than a bare number. */
                    <span className="bg-tint-warning text-tint-warning-foreground ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums">
                      {badge > 99 ? "99+" : badge}
                      <span className="sr-only"> awaiting confirmation</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
