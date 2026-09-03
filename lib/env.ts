import { z } from "zod";

/**
 * Validated environment access.
 *
 * Both accessors are lazy and cached. Laziness is deliberate: validating at
 * import time would fail `next build` on any machine without a populated
 * `.env.local`, even for routes that never touch Supabase. Reading at the point
 * of use still fails fast, but with a message that names the missing variable.
 *
 * `process.env.NEXT_PUBLIC_*` is inlined at build time, so reading it inside a
 * function is still statically replaced.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublicEnv: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  cachedPublicEnv ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  return cachedPublicEnv;
}

const serverSchema = z.object({
  /**
   * Bypasses Row Level Security. Confined to `scripts/` and `supabase/`;
   * an ESLint rule blocks the admin client from reaching a request path.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cachedServerEnv ??= serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return cachedServerEnv;
}
