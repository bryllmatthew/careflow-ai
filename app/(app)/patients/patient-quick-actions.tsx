"use client";

import type { ReactNode } from "react";
import {
  CalendarPlus,
  Receipt,
  Wallet,
  ClipboardPlus,
  Pencil,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PatientFormDialog } from "./patient-form-dialog";
import type { PatientDetail } from "./queries";
import { patientGenders, type PatientFormInput } from "@/lib/validation/patient.schema";
import { AppointmentFormDialog } from "../appointments/appointment-form-dialog";
import { FollowUpFormDialog } from "../followups/followup-form-dialog";
import { NewInvoiceDialog } from "../invoices/new-invoice-dialog";

type ServiceOption = { id: string; name: string; durationMinutes: number; price: string; clinicId: string };

function asFormGender(gender: string | null): PatientFormInput["gender"] {
  return (patientGenders as readonly string[]).includes(gender ?? "")
    ? (gender as PatientFormInput["gender"])
    : undefined;
}

/**
 * Record Payment / Send Message still have no backing module (payment
 * recording is Phase 6, Communication has no module at all) -- they render
 * as disabled buttons that say so on hover, per the "some actions may
 * initially be placeholders or disabled -- do not create fake
 * functionality" instruction. Book Appointment (Phase 3), Add Follow-Up
 * (Phase 4), Create Invoice (Phase 5) and Edit Patient are real.
 */
export function PatientQuickActions({
  patient,
  clinics,
  practitioners,
  services,
  canUpdate,
  canBookAppointment,
  canRecordPayment,
  canAddFollowUp,
  canCreateInvoice,
}: {
  patient: PatientDetail;
  clinics: { id: string; name: string }[];
  practitioners: { id: string; name: string }[];
  services: ServiceOption[];
  canUpdate: boolean;
  canBookAppointment: boolean;
  canRecordPayment: boolean;
  canAddFollowUp: boolean;
  canCreateInvoice: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canBookAppointment ? (
        <AppointmentFormDialog
          clinics={clinics}
          practitioners={practitioners}
          services={services}
          defaultPatient={{ id: patient.id, name: `${patient.firstName} ${patient.lastName}` }}
          defaultClinicId={patient.clinicId}
          trigger={
            <Button variant="outline" size="sm">
              <CalendarPlus className="size-4" />
              Book Appointment
            </Button>
          }
        />
      ) : (
        <PlaceholderAction
          icon={<CalendarPlus className="size-4" />}
          label="Book Appointment"
          reason="You don't have permission to book appointments."
        />
      )}
      {canCreateInvoice ? (
        <NewInvoiceDialog
          clinics={clinics}
          defaultPatient={{ id: patient.id, name: `${patient.firstName} ${patient.lastName}` }}
          defaultClinicId={patient.clinicId}
          trigger={
            <Button variant="outline" size="sm">
              <Receipt className="size-4" />
              Create Invoice
            </Button>
          }
        />
      ) : (
        <PlaceholderAction
          icon={<Receipt className="size-4" />}
          label="Create Invoice"
          reason="You don't have permission to create invoices."
        />
      )}
      <PlaceholderAction
        icon={<Wallet className="size-4" />}
        label="Record Payment"
        reason={
          canRecordPayment ? "Payments aren't built yet." : "You don't have permission to record payments."
        }
      />
      {canAddFollowUp ? (
        <FollowUpFormDialog
          clinics={clinics}
          staff={practitioners}
          defaultPatient={{ id: patient.id, name: `${patient.firstName} ${patient.lastName}` }}
          defaultClinicId={patient.clinicId}
          trigger={
            <Button variant="outline" size="sm">
              <ClipboardPlus className="size-4" />
              Add Follow-Up
            </Button>
          }
        />
      ) : (
        <PlaceholderAction
          icon={<ClipboardPlus className="size-4" />}
          label="Add Follow-Up"
          reason="You don't have permission to create follow-ups."
        />
      )}
      {canUpdate ? (
        <PatientFormDialog
          patientId={patient.id}
          clinics={clinics}
          practitioners={practitioners}
          initialValues={{
            firstName: patient.firstName,
            lastName: patient.lastName,
            phone: patient.phone ?? "",
            email: patient.email ?? "",
            dateOfBirth: patient.dateOfBirth ?? "",
            gender: asFormGender(patient.gender),
            address: patient.address ?? "",
            notes: patient.notes ?? "",
            clinicId: patient.clinicId,
            assignedStaffId: patient.assignedStaffId ?? "",
          }}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="size-4" />
              Edit Patient
            </Button>
          }
        />
      ) : (
        <PlaceholderAction
          icon={<Pencil className="size-4" />}
          label="Edit Patient"
          reason="You don't have permission to edit this patient."
        />
      )}
      <PlaceholderAction
        icon={<MessageSquare className="size-4" />}
        label="Send Message"
        reason="Messaging isn't built yet."
      />
    </div>
  );
}

function PlaceholderAction({
  icon,
  label,
  reason,
}: {
  icon: ReactNode;
  label: string;
  reason: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant="outline" size="sm" disabled>
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
