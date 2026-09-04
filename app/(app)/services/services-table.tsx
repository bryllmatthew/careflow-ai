"use client";

import { useTransition } from "react";
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Money } from "@/components/patterns/money";
import { toast } from "sonner";
import type { ServiceRow } from "./queries";
import { setServiceStatusAction, deleteServiceAction } from "./actions";
import { ServiceFormDialog } from "./service-form-dialog";

export function ServicesTable({
  services,
  clinics,
  canManage,
}: {
  services: ServiceRow[];
  clinics: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggleStatus(service: ServiceRow) {
    const next = service.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      try {
        await setServiceStatusAction(service.id, next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update service.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Clinic</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell className="text-muted-foreground">{s.clinicName ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{s.durationMinutes} min</TableCell>
            <TableCell>
              <Money value={s.price} />
            </TableCell>
            <TableCell>
              <Badge variant={s.status === "active" ? "default" : "secondary"}>
                {s.status === "active" ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <ServiceFormDialog
                      serviceId={s.id}
                      clinics={clinics}
                      initialValues={{
                        name: s.name,
                        description: s.description ?? "",
                        durationMinutes: s.durationMinutes,
                        price: s.price,
                        cost: s.cost ?? "",
                        clinicId: s.clinicId,
                      }}
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                      }
                    />
                    <DropdownMenuItem disabled={pending} onSelect={() => toggleStatus(s)}>
                      {s.status === "active" ? (
                        <>
                          <Archive className="size-4" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="size-4" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    <ConfirmDialog
                      trigger={
                        <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      }
                      title={`Delete ${s.name}?`}
                      description="This removes the service from the catalogue. Past appointments and invoices that used it are kept, not erased."
                      confirmLabel="Delete"
                      onConfirm={() => deleteServiceAction(s.id)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
