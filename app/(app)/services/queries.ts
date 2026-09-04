import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  cost: string | null;
  status: string;
  clinicId: string;
  clinicName: string | null;
};

export async function listServices(
  organizationId: string,
  options?: { includeInactive?: boolean },
): Promise<ServiceRow[]> {
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("services")
    .select("id, name, description, duration_minutes, price, cost, status, clinic_id, clinics(name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (!options?.includeInactive) {
    query = query.eq("status", "active");
  }

  const { data } = await query.order("name");

  // PostgREST serializes numeric(14,2) as a JSON number, not a string --
  // lib/db/types.generated.ts reflects that reality. Converted to a fixed
  // 2-decimal string right here at the query boundary so nothing past this
  // point in the app ever does arithmetic on money; every amount downstream
  // is an opaque display string formatted via <Money> (CLAUDE.md).
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.duration_minutes,
    price: s.price.toFixed(2),
    cost: s.cost === null ? null : s.cost.toFixed(2),
    status: s.status,
    clinicId: s.clinic_id,
    clinicName: s.clinics?.name ?? null,
  }));
}

/**
 * For selects elsewhere (the appointment booking form) -- active services
 * only, with just the fields a booking needs. Includes clinicId (not filtered
 * server-side to one clinic) so the booking form can re-filter its service
 * list client-side as the user changes the clinic selector, without a round
 * trip per change.
 */
export async function listServiceOptions(
  organizationId: string,
): Promise<{ id: string; name: string; durationMinutes: number; price: string; clinicId: string }[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price, clinic_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.duration_minutes,
    price: s.price.toFixed(2),
    clinicId: s.clinic_id,
  }));
}
