import { MapPin, Phone, Mail, Clock } from "lucide-react";
import type { PublicClinic } from "@/lib/booking/public-queries";
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from "@/lib/validation/booking.schema";

/**
 * The clinic's public contact block.
 *
 * Every field here is absent from the RPC payload entirely unless the clinic
 * turned its show_* flag on (migration 0020), so this component cannot leak a
 * detail the clinic chose to keep private -- it renders what it was given and
 * has no way to ask for more.
 */
export function ClinicFooter({ clinic }: { clinic: PublicClinic }) {
  const hours = clinic.businessHours;
  const hasHours = hours && WEEKDAY_KEYS.some((d) => (hours[d]?.length ?? 0) > 0);
  const hasContact = clinic.address || clinic.phone || clinic.email;

  if (!hasContact && !hasHours) return null;

  return (
    <footer className="text-muted-foreground mt-10 grid gap-6 text-sm sm:grid-cols-2">
      {hasContact && (
        <div className="space-y-2">
          <h2 className="text-foreground text-xs font-medium tracking-wider uppercase">Contact</h2>
          {clinic.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{clinic.address}</span>
            </p>
          )}
          {clinic.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" aria-hidden />
              <a
                href={`tel:${clinic.phone}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {clinic.phone}
              </a>
            </p>
          )}
          {clinic.email && (
            <p className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" aria-hidden />
              <a
                href={`mailto:${clinic.email}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {clinic.email}
              </a>
            </p>
          )}
        </div>
      )}

      {hasHours && hours && (
        <div className="space-y-2">
          <h2 className="text-foreground flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
            <Clock className="size-3.5" aria-hidden />
            Opening hours
          </h2>
          <dl className="space-y-1">
            {WEEKDAY_KEYS.map((day) => {
              const windows = hours[day] ?? [];
              return (
                <div key={day} className="flex justify-between gap-4">
                  <dt>{WEEKDAY_LABELS[day]}</dt>
                  <dd className="tabular-nums">
                    {windows.length === 0
                      ? "Closed"
                      : windows.map((w) => `${w.open}–${w.close}`).join(", ")}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </footer>
  );
}
