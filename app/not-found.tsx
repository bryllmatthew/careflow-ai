import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <FileQuestion className="text-muted-foreground size-8" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}
