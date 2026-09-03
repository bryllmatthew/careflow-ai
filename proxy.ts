import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`.
 *
 * Session refresh only — never an authorization boundary. See
 * `lib/supabase/proxy.ts` for why.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Skip static assets and image optimization so auth cookie handling never
   * interferes with serving CSS, JS, or images.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
