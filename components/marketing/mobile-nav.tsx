"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { NAV_LINKS } from "./nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle className="text-left">
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="hover:bg-muted rounded-lg px-3 py-2.5 text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <Button asChild variant="outline" className="h-10">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="h-10">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
