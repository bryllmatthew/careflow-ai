"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { applyDiscountAction, updateInvoiceDetailsAction } from "./actions";

export function InvoiceDiscountTaxEditor({
  invoiceId,
  discountType,
  discountValue,
  taxRate,
  canApplyDiscount,
  canEditTax,
}: {
  invoiceId: string;
  discountType: string | null;
  discountValue: string | null;
  taxRate: string;
  canApplyDiscount: boolean;
  canEditTax: boolean;
}) {
  const [type, setType] = useState<string>(discountType ?? "none");
  const [value, setValue] = useState(discountValue ?? "");
  const [tax, setTax] = useState(taxRate);
  const [pending, startTransition] = useTransition();

  function saveDiscount() {
    startTransition(async () => {
      const result = await applyDiscountAction(invoiceId, {
        discountType: type === "none" ? null : (type as "fixed" | "percentage"),
        discountValue: type === "none" ? undefined : value,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Discount updated.");
    });
  }

  function saveTax() {
    startTransition(async () => {
      const result = await updateInvoiceDetailsAction(invoiceId, { taxRate: Number(tax) });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Tax updated.");
    });
  }

  if (!canApplyDiscount && !canEditTax) return null;

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      {canApplyDiscount && (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Discount</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type !== "none" && (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "percentage" ? "e.g. 10" : "e.g. 500"}
              className="w-28"
            />
          )}
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={saveDiscount}>
            Apply
          </Button>
        </div>
      )}

      {canEditTax && (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="tax-rate" className="text-xs">
              Tax rate (%)
            </Label>
            <Input
              id="tax-rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              className="w-28"
            />
          </div>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={saveTax}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
