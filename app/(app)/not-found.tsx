import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";

/** Rendered inside the shell -- see app/(app)/error.tsx for why. */
export default function AppNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Not found"
      description="That page or record doesn't exist, or you may not have access to it."
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/">Go to dashboard</Link>
        </Button>
      }
    />
  );
}
