import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";

/**
 * Every nav destination exists as a route from Task 1.10 onward, even before
 * its real page is built -- so the sidebar is fully navigable immediately and
 * each later phase only has to replace a page.tsx, never restructure routing.
 * See lib/navigation.ts.
 */
export function PlaceholderPage({
  title,
  icon,
  description,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState icon={icon} title="Not built yet" description={description} />
    </div>
  );
}
