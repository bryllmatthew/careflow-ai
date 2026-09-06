"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Ban, RotateCcw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SupplierRow } from "./queries";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { setSupplierStatusAction } from "./actions";

export function SuppliersTable({
  suppliers,
  canManage,
}: {
  suppliers: SupplierRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleStatus(supplier: SupplierRow) {
    startTransition(async () => {
      const next = supplier.status === "active" ? "inactive" : "active";
      const result = await setSupplierStatusAction(supplier.id, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Status</TableHead>
          {canManage && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell className="text-muted-foreground">{s.contactPerson ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{s.email ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={s.status === "active" ? "default" : "secondary"}>
                {s.status === "active" ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            {canManage && (
              <TableCell>
                <div className="flex justify-end gap-2">
                  <SupplierFormDialog
                    supplier={s}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => toggleStatus(s)}
                  >
                    {s.status === "active" ? (
                      <Ban className="size-4" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
