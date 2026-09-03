import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while a page inside the shell is server-rendering (Next wraps this
 * segment in a Suspense boundary automatically). Generic enough for any
 * page: a header-shaped bar plus a content block, not tailored to one
 * page's actual layout.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b pb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
