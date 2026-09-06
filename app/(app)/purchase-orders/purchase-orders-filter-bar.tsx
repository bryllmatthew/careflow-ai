"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  purchaseOrderStatuses,
  purchaseOrderStatusLabels,
} from "@/lib/validation/purchase-order.schema";

const ALL = "all";

export function PurchaseOrdersFilterBar({
  clinics,
  suppliers,
}: {
  clinics: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {clinics.length > 1 && (
        <Select
          value={searchParams.get("clinic") ?? ALL}
          onValueChange={(v) => updateParams({ clinic: v })}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clinics</SelectItem>
            {clinics.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={searchParams.get("supplier") ?? ALL}
        onValueChange={(v) => updateParams({ supplier: v })}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Supplier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All suppliers</SelectItem>
          {suppliers.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("status") ?? ALL}
        onValueChange={(v) => updateParams({ status: v })}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {purchaseOrderStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {purchaseOrderStatusLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
