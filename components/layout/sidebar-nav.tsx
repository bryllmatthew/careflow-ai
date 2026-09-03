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
  onNavigate,
}: {
  visibleHrefs: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visible = new Set(visibleHrefs);

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => visible.has(item.href)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="flex flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-muted-foreground px-3 pb-1 text-xs font-medium tracking-wide uppercase">
            {section.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
