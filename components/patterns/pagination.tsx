import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Server-rendered prev/next links (searchParams drive page state, per
 * CLAUDE.md -- "prefer RSC and searchParams for list state over client
 * state"), not a client component re-fetching on click.
 */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const disabledClass = cn(buttonLikeClasses, "pointer-events-none opacity-50");

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <p className="text-sm text-muted-foreground">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        {page <= 1 ? (
          <span className={disabledClass} aria-disabled="true">
            <ChevronLeft className="size-4" />
            Previous
          </span>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="size-4" />
              Previous
            </Link>
          </Button>
        )}
        {page >= totalPages ? (
          <span className={disabledClass} aria-disabled="true">
            Next
            <ChevronRight className="size-4" />
          </span>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page + 1)}>
              Next
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// Mirrors the outline/sm Button's own classes so the disabled span looks
// identical to the real button -- a Link cannot be given a native `disabled`
// attribute (anchors don't support one, so it would render but stay
// clickable), so an unclickable state has to be a non-interactive element
// styled to match, not a Button/Link pretending to be disabled.
const buttonLikeClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 h-8 text-sm font-medium";
