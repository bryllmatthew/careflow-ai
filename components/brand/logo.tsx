import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The CareFlow brand: one mark and wordmark used everywhere -- landing page,
 * auth and onboarding screens, and the app shell -- so the product reads as
 * one thing from the first visit to the dashboard.
 */

/** The mark: a pulse line on the brand indigo tile. Mirrored by app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] shadow-[0_6px_16px_-6px_var(--primary)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[56%]" fill="none">
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

/**
 * Mark + wordmark. Pass `href` to make it a link (the landing page and auth
 * screens link home, the app shell links to the dashboard); omit it where the
 * logo sits inside another heading or control.
 */
export function Logo({
  href,
  size = "default",
  className,
}: {
  href?: string;
  size?: "default" | "lg";
  className?: string;
}) {
  const content = (
    <>
      <LogoMark className={size === "lg" ? "size-9" : undefined} />
      <span
        className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-[15px]")}
      >
        CareFlow <span className="text-primary">AI</span>
      </span>
    </>
  );
  const classes = cn("inline-flex items-center gap-2.5", className);

  return href ? (
    <Link href={href} className={classes} aria-label="CareFlow AI home">
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
