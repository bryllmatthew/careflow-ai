import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types.generated";

/**
 * The anonymous Supabase client used by the public booking pages.
 *
 * Deliberately NOT getSupabaseServerClient(): that one reads and writes auth
 * cookies, and a patient booking an appointment has no CareFlow session to
 * refresh. Attaching one would mean the public page mutates cookies on a
 * request whose whole point is that it is unauthenticated, and it would make
 * the page's behaviour depend on whether the visitor happened to be a signed-in
 * staff member -- which is exactly the sort of ambient authority a public page
 * must not have.
 *
 * This carries the anon key, which after migration 0001's
 * `revoke all on all tables in schema public from anon` grants access to
 * nothing at all except the handful of booking RPCs explicitly granted in
 * migration 0020. That is the security model: the anon role's capability
 * surface is a short, readable list of functions, not a set of table policies.
 */
export function getPublicBookingClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * A stable, non-reversible per-client key for rate limiting.
 *
 * The raw IP is hashed and never stored: the rate-limit table would otherwise
 * become an undeclared log of every visitor's address, which is personal data
 * under the Philippine Data Privacy Act (CLAUDE.md's "Known open questions"
 * flags the compliance regime as unresolved -- that is a reason to collect
 * less, not a licence to collect freely). The hash is all the counter needs.
 *
 * Returns null when no forwarded address is present. app.consume_rate_limit
 * treats that as "no usable identity" and fails open rather than throttling
 * every visitor into one shared bucket.
 */
export async function getClientRateKey(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  if (!ip) return null;
  return createHash("sha256").update(`careflow-booking:${ip}`).digest("hex").slice(0, 32);
}
