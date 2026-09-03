"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary -- a safety net for genuine crashes, not the primary
 * UX for expected failures. Every Server Action in this app already returns
 * a typed { error } result rather than letting exceptions propagate (see
 * app/(auth)/actions.ts, app/(app)/clinics/actions.ts), so this fires for
 * bugs and infrastructure hiccups, not permission denials or bad input --
 * there is no error type worth branching on here.
 *
 * Next.js sanitizes error.message for exceptions thrown in Server
 * Components/Actions in production (to avoid leaking details), so this
 * deliberately never displays error.message to the user -- only the digest,
 * which support can match against server-side logs.
 */
export default function Error({
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="text-muted-foreground size-8" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          An unexpected error occurred. Try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="text-muted-foreground/70 mt-2 text-xs">Reference: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild>
          <Link href="/">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
