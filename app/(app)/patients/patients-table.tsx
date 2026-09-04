"use client";

import { useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal, Archive, ArchiveRestore } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PatientStatusBadge } from "@/components/patterns/patient-status-badge";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import type { PatientListRow } from "./queries";
import { setPatientStatusAction } from "./actions";

/**
 * No inline "Edit" here, deliberately: PatientListRow carries only the
 * columns this table displays, not date_of_birth/gender/address/notes/
 * clinic_id. Opening an edit dialog with that partial data and letting
 * someone submit it would silently blank out every field the list query
 * doesn't select. Editing lives on the profile page, which loads the
 * complete record -- see app/(app)/patients/[id]/page.tsx.
 */
export function PatientsTable({
  patients,
  canDelete,
}: {
  patients: PatientListRow[];
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggleArchive(patient: PatientListRow) {
    const next = patient.status === "archived" ? "active" : "archived";
    startTransition(async () => {
      try {
        await setPatientStatusAction(patient.id, next, patient.status);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update patient.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Clinic</TableHead>
          <TableHead>Practitioner</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {patients.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">
              <Link href={`/patients/${p.id}`} className="hover:underline">
                {p.firstName} {p.lastName}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {[p.phone, p.email].filter(Boolean).join(" · ") || "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{p.clinicName ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {p.assignedPractitionerName ?? "—"}
            </TableCell>
            <TableCell>
              <PatientStatusBadge status={p.status} />
            </TableCell>
            <TableCell>
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${p.firstName} ${p.lastName}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {p.status === "archived" ? (
                      <DropdownMenuItem disabled={pending} onSelect={() => toggleArchive(p)}>
                        <ArchiveRestore className="size-4" />
                        Restore
                      </DropdownMenuItem>
                    ) : (
                      <ConfirmDialog
                        trigger={
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Archive className="size-4" />
                            Archive
                          </DropdownMenuItem>
                        }
                        title={`Archive ${p.firstName} ${p.lastName}?`}
                        description="Their record is kept, not erased, and can be restored later."
                        confirmLabel="Archive"
                        onConfirm={async () => toggleArchive(p)}
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
