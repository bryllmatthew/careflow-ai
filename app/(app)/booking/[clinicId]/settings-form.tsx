"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveBookingSettingsAction } from "../actions";
import type { BookingSettingsInput } from "@/lib/validation/booking.schema";
import type { BookingClinicDetail } from "../queries";

/** The slot intervals the schema and the CHECK constraint both allow. */
const SLOT_INTERVALS = [5, 10, 15, 20, 30, 60] as const;
type SlotInterval = (typeof SLOT_INTERVALS)[number];

function asSlotInterval(value: number): SlotInterval {
  // The database CHECK guarantees one of these, but the generated type is a
  // plain integer -- narrowing here rather than casting keeps a future
  // constraint change from silently producing an invalid Select value.
  return (SLOT_INTERVALS as readonly number[]).includes(value) ? (value as SlotInterval) : 15;
}

/** The table's own defaults (migration 0019), so an unconfigured clinic shows what it would get. */
const DEFAULTS: BookingSettingsInput = {
  onlineBookingEnabled: false,
  minNoticeHours: 4,
  maxAdvanceDays: 60,
  slotIntervalMinutes: 15,
  confirmationMode: "manual",
  allowAnyPractitioner: true,
  allowCancellation: true,
  allowRescheduling: true,
  manageCutoffHours: 24,
  showAddress: true,
  showPhone: true,
  showEmail: false,
  showBusinessHours: true,
  primaryColor: undefined,
  welcomeMessage: undefined,
};

export function BookingSettingsForm({
  clinicId,
  settings,
  canEdit,
}: {
  clinicId: string;
  settings: BookingClinicDetail["settings"];
  canEdit: boolean;
}) {
  const [form, setForm] = useState<BookingSettingsInput>(() =>
    settings
      ? {
          ...settings,
          slotIntervalMinutes: asSlotInterval(settings.slotIntervalMinutes),
          // The database stores "unset" as NULL; the Zod schema models it as
          // undefined (an absent optional). Normalising here is the one place
          // those two vocabularies meet.
          primaryColor: settings.primaryColor ?? undefined,
          welcomeMessage: settings.welcomeMessage ?? undefined,
        }
      : DEFAULTS,
  );
  const [pending, startTransition] = useTransition();

  function set<K extends keyof BookingSettingsInput>(key: K, value: BookingSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveBookingSettingsAction(clinicId, form);
      if (result.error) toast.error(result.error);
      else toast.success("Booking settings saved");
    });
  }

  const disabled = !canEdit || pending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Online booking</CardTitle>
          <CardDescription>The master switch for this clinic&apos;s booking page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            id="enabled"
            label="Accept online bookings"
            description="When off, the booking page shows an unavailable message."
            checked={form.onlineBookingEnabled}
            disabled={disabled}
            onChange={(v) => set("onlineBookingEnabled", v)}
          />

          <div className="grid gap-1.5">
            <Label htmlFor="confirmation-mode">When a patient books</Label>
            <Select
              value={form.confirmationMode}
              disabled={disabled}
              onValueChange={(v) => set("confirmationMode", v as "auto" | "manual")}
            >
              <SelectTrigger id="confirmation-mode" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Hold for the clinic to confirm</SelectItem>
                <SelectItem value="auto">Confirm automatically</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {form.confirmationMode === "manual"
                ? "Bookings arrive as Pending in your calendar."
                : "Bookings arrive as Confirmed and the patient is told so immediately."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking window</CardTitle>
          <CardDescription>How far ahead patients can book, and how soon.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="min-notice"
            label="Minimum notice"
            suffix="hours"
            value={form.minNoticeHours}
            min={0}
            max={720}
            disabled={disabled}
            onChange={(v) => set("minNoticeHours", v)}
            hint="Blocks last-minute bookings nobody would see in time."
          />
          <NumberField
            id="max-advance"
            label="Book up to"
            suffix="days ahead"
            value={form.maxAdvanceDays}
            min={1}
            max={365}
            disabled={disabled}
            onChange={(v) => set("maxAdvanceDays", v)}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="slot-interval">Time slots every</Label>
            <Select
              value={String(form.slotIntervalMinutes)}
              disabled={disabled}
              onValueChange={(v) => set("slotIntervalMinutes", asSlotInterval(Number(v)))}
            >
              <SelectTrigger id="slot-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_INTERVALS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What patients can do</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            id="any-practitioner"
            label={<>Offer &ldquo;any available practitioner&rdquo;</>}
            description="Usually gets the patient an earlier appointment."
            checked={form.allowAnyPractitioner}
            disabled={disabled}
            onChange={(v) => set("allowAnyPractitioner", v)}
          />
          <Toggle
            id="allow-cancel"
            label="Let patients cancel online"
            checked={form.allowCancellation}
            disabled={disabled}
            onChange={(v) => set("allowCancellation", v)}
          />
          <Toggle
            id="allow-reschedule"
            label="Let patients reschedule online"
            checked={form.allowRescheduling}
            disabled={disabled}
            onChange={(v) => set("allowRescheduling", v)}
          />
          <NumberField
            id="manage-cutoff"
            label="Stop self-service"
            suffix="hours before"
            value={form.manageCutoffHours}
            min={0}
            max={720}
            disabled={disabled || (!form.allowCancellation && !form.allowRescheduling)}
            onChange={(v) => set("manageCutoffHours", v)}
            hint="Closer than this, patients are asked to call instead."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the page shows</CardTitle>
          <CardDescription>
            Everything here is off unless you turn it on — nothing about the clinic is published by
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            id="show-address"
            label="Show the clinic address"
            checked={form.showAddress}
            disabled={disabled}
            onChange={(v) => set("showAddress", v)}
          />
          <Toggle
            id="show-phone"
            label="Show the clinic phone number"
            checked={form.showPhone}
            disabled={disabled}
            onChange={(v) => set("showPhone", v)}
          />
          <Toggle
            id="show-email"
            label="Show the clinic email address"
            checked={form.showEmail}
            disabled={disabled}
            onChange={(v) => set("showEmail", v)}
          />
          <Toggle
            id="show-hours"
            label="Show opening hours"
            checked={form.showBusinessHours}
            disabled={disabled}
            onChange={(v) => set("showBusinessHours", v)}
          />

          <div className="grid gap-1.5">
            <Label htmlFor="welcome">Welcome message</Label>
            <Textarea
              id="welcome"
              rows={2}
              maxLength={500}
              disabled={disabled}
              value={form.welcomeMessage ?? ""}
              placeholder="Choose a service to get started."
              onChange={(e) => set("welcomeMessage", e.target.value || undefined)}
            />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save settings
        </Button>
      )}
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: ReactNode;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  suffix,
  value,
  min,
  max,
  disabled,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          className="w-24"
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
        />
        <span className="text-muted-foreground text-sm">{suffix}</span>
      </div>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
