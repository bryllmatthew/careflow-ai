import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="bg-background/75 [@supports(backdrop-filter:blur(0))]:border-border/60 sticky top-0 z-40 border-b border-transparent backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Logo href="/" />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden h-9 px-3 sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="h-9 px-4">
            <Link href="/signup">Get started</Link>
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
