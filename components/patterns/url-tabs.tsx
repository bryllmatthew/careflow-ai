"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

/**
 * Same shadcn Tabs, with the active tab mirrored into the `tab` searchParam
 * -- so a dashboard cross-link like `/reports/business?tab=clinics` lands
 * on the right tab, and reloading/sharing the report page keeps it
 * (section 31: "preserve filters/scope while navigating between report
 * pages").
 */
export function UrlTabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("tab") ?? defaultValue;

  function onValueChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onValueChange}>
      {children}
    </Tabs>
  );
}
