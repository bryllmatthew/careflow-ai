"use client";

import { useState } from "react";
import { Menu, ChevronDown, Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";
import { SidebarNav } from "./sidebar-nav";

function initials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (trimmed.includes("@")) return trimmed[0]?.toUpperCase() ?? "?";
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Topbar({
  organizationName,
  userEmail,
  visibleHrefs,
}: {
  organizationName: string;
  userEmail: string;
  visibleHrefs: string[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {/* Mobile nav trigger -- the sidebar itself is desktop-only (see AppShell) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-left text-sm font-semibold">CareFlow AI</SheetTitle>
          </SheetHeader>
          <SidebarNav visibleHrefs={visibleHrefs} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Clinic switcher lands with multi-clinic UI; MVP is single-org, so this
          is a static label for now -- see CLAUDE.md "Deliberate deviations". */}
      <Button variant="ghost" className="gap-1.5 px-2 font-medium" disabled>
        {organizationName}
        <ChevronDown className="text-muted-foreground size-3.5" />
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
        <Bell className="size-4.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="size-6">
              <AvatarFallback className="text-xs">{initials(userEmail)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm sm:inline">{userEmail}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="truncate">{userEmail}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutAction()} variant="destructive">
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
