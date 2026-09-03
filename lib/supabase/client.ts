"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types.generated";

/**
 * Supabase client for Client Components.
 *
 * Carries the end user's session, so Row Level Security applies. Only use this
 * for interactive client-side needs (auth forms, realtime subscriptions);
 * prefer reading data in Server Components via `getSupabaseServerClient()`.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
