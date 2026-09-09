"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppointmentStatusBadge } from "@/components/patterns/appointment-status-badge";
import { NewBadge } from "@/components/patterns/new-badge";
import { Money } from "@/components/patterns/money";
import type { AppointmentRow } from "./queries";
import { AppointmentDetailSheet } from "./appointment-detail-sheet";

export function AppointmentsTable({
  appointments,
  canUpdate,
  canCancel,
  canReschedule,
  canCreateInvoice,
}: {
  appointments: AppointmentRow[];
  canUpdate: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canCreateInvoice?: boolean;
}) {
  const [selected, setSelected] = useState<AppointmentRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Practitioner</TableHead>
            <TableHead>Clinic</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((a) => (
            <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
              <TableCell className="font-medium">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(a.startAt))}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  {a.patientName}
                  {a.isNew && <NewBadge />}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{a.serviceName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{a.staffName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{a.clinicName ?? "—"}</TableCell>
              <TableCell>
                <Money value={a.servicePrice} />
              </TableCell>
              <TableCell>
                <AppointmentStatusBadge status={a.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AppointmentDetailSheet
        appointment={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        canUpdate={canUpdate}
        canCreateInvoice={canCreateInvoice}
        canCancel={canCancel}
        canReschedule={canReschedule}
      />
    </>
  );
}
