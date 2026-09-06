"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import { orderPurchaseOrderAction, cancelPurchaseOrderAction } from "./actions";

export function PoActions({
  purchaseOrderId,
  status,
  canManage,
}: {
  purchaseOrderId: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  function order() {
    startTransition(async () => {
      const result = await orderPurchaseOrderAction(purchaseOrderId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Purchase order sent to supplier.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <Button size="sm" disabled={pending} onClick={order}>
          <CheckCircle2 className="size-4" />
          Order
        </Button>
      )}
      {["draft", "ordered", "partially_received"].includes(status) && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={pending}>
              <Ban className="size-4" />
              Cancel
            </Button>
          }
          title="Cancel this purchase order?"
          description="It stays in history, marked cancelled. Any stock already received is not reversed."
          confirmLabel="Cancel purchase order"
          onConfirm={async () => {
            const result = await cancelPurchaseOrderAction(purchaseOrderId);
            if (result.error) throw new Error(result.error);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
