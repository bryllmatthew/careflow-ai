import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types.generated";

/**
 * ⚠ SERVICE-ROLE CLIENT — BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Permitted ONLY in `scripts/` (admin tooling, seeds) and `supabase/`. An ESLint
 * rule (`careflow/service-role-client-guard`) errors if this module is imported
 * anywhere else, because a single request-path use would defeat the whole tenant
 * isolation model. Do not suppress that rule.
 *
 * Request paths must use `getSupabaseServerClient()` from `./server`.
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
