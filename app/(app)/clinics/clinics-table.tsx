"use client";

import { useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import { setClinicStatusAction, deleteClinicAction } from "./actions";
import { ClinicFormDialog } from "./clinic-form-dialog";

export type ClinicRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  status: string;
  canUpdate: boolean;
  canDelete: boolean;
};

export function ClinicsTable({ clinics }: { clinics: ClinicRow[] }) {
  const [pending, startTransition] = useTransition();

  function toggleStatus(clinic: ClinicRow, next: boolean) {
    startTransition(async () => {
      try {
        await setClinicStatusAction(clinic.id, next ? "active" : "inactive");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update status.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Timezone</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {clinics.map((clinic) => (
          <TableRow key={clinic.id}>
            <TableCell className="font-medium">{clinic.name}</TableCell>
            <TableCell className="text-muted-foreground">{clinic.address ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {clinic.phone ?? clinic.email ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{clinic.timezone}</TableCell>
            <TableCell>
              {clinic.canUpdate ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={clinic.status === "active"}
                    onCheckedChange={(checked) => toggleStatus(clinic, checked)}
                    disabled={pending}
                    aria-label={`${clinic.name} status`}
                  />
                  <span className="text-muted-foreground text-sm">
                    {clinic.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>
              ) : (
                <Badge variant={clinic.status === "active" ? "default" : "secondary"}>
                  {clinic.status === "active" ? "Active" : "Inactive"}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              {(clinic.canUpdate || clinic.canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${clinic.name}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {clinic.canUpdate && (
                      <ClinicFormDialog
                        clinicId={clinic.id}
                        initialValues={{
                          name: clinic.name,
                          address: clinic.address ?? "",
                          phone: clinic.phone ?? "",
                          email: clinic.email ?? "",
                          timezone: clinic.timezone,
                        }}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                        }
                      />
                    )}
                    {clinic.canDelete && (
                      <ConfirmDialog
                        trigger={
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        }
                        title={`Delete ${clinic.name}?`}
                        description="This removes the clinic from active use. Its records are kept, not erased."
                        confirmLabel="Delete"
                        onConfirm={() => deleteClinicAction(clinic.id)}
                      />
                    )}
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
