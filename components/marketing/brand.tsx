import Link from "next/link";
import { cn } from "@/lib/utils";

/** The CareFlow mark: a care cross whose stroke flows into a pulse line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-[10px] shadow-[0_6px_16px_-6px_var(--primary)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none">
        <path
          d="M3 13h4l2.2-5 3.6 9 2.2-4H21"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}
      aria-label="CareFlow AI home"
    >
      <LogoMark />
      <span className="text-[15px]">
        CareFlow <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}
