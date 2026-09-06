"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { setProductStatusAction } from "./actions";

export function ProductStatusForm({
  productId,
  nextStatus,
  label,
  icon,
}: {
  productId: string;
  nextStatus: "active" | "inactive";
  label: string;
  icon?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await setProductStatusAction(productId, nextStatus);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(nextStatus === "active" ? "Product reactivated." : "Product deactivated.");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={submit}>
      {icon}
      {pending ? "Saving…" : label}
    </Button>
  );
}
