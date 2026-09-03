import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types.generated";

/**
 * Refreshes the Supabase session and writes any rotated auth cookies onto the
 * outgoing response.
 *
 * This is the ONLY job of the proxy. It is deliberately not an authorization
 * check: Next.js may run the proxy on a CDN edge, separate from render code, and
 * `AUTHORIZATION.md` §8 requires that authorization be resolved server-side from
 * the session at the point of use. Route protection lives in the `(app)` layout
 * and in `requirePermission()`.
 *
 * Cookies are written to BOTH the request and the response: the request copy is
 * what Server Components read during this same render, and the response copy is
 * what the browser persists.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the session so an expired access token is refreshed and the rotated
  // cookies flow through `setAll` above. `getClaims()` verifies the JWT locally
  // where possible, avoiding a network round trip on every request.
  await supabase.auth.getClaims();

  return response;
}
