import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types.generated";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Carries the end user's JWT, so **Row Level Security applies** — this is the
 * only client permitted on a request path. See CLAUDE.md → "Non-negotiable
 * security rules".
 *
 * A fresh client is created per call: Supabase clients must never be shared
 * across requests.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. This is expected and safe:
            // `proxy.ts` refreshes the session and writes the cookies on every
            // request, so a failed write here is never the only chance to persist
            // a refreshed token.
          }
        },
      },
    },
  );
}
