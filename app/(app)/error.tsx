"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Same reasoning as app/error.tsx, but rendered INSIDE the (app) layout, so
 * the sidebar and topbar stay visible -- only the page content area shows
 * the fallback. error.js wraps page.js/loading.js within its own segment
 * but not the layout.js above it, which is exactly the behavior this relies
 * on.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <AlertTriangle className="text-muted-foreground size-8" aria-hidden />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="text-muted-foreground mt-1 text-sm">
          This page hit an unexpected error. Try again, or pick something else from the sidebar.
        </p>
        {error.digest && (
          <p className="text-muted-foreground/70 mt-2 text-xs">Reference: {error.digest}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
