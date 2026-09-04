import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The service-role Supabase client bypasses Row Level Security entirely. The whole tenancy
 * model depends on it never reaching a request path, so that rule is enforced mechanically
 * here rather than left to code review. See CLAUDE.md → "Non-negotiable security rules".
 */
const serviceRoleClientGuard = {
  name: "careflow/service-role-client-guard",
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/lib/supabase/admin", "@/lib/supabase/admin", "**/supabase/admin"],
            message:
              "The Supabase service-role client bypasses RLS and is confined to scripts/ and supabase/. Request paths must use @/lib/supabase/server so the end user's JWT is carried and RLS applies.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  serviceRoleClientGuard,
  {
    // Admin tooling and migrations are the one place the service-role key belongs.
    name: "careflow/service-role-client-allowlist",
    files: [
      "scripts/**/*.{ts,tsx,mts,mjs}",
      "supabase/**/*.{ts,mts,mjs}",
      // The one request-path exception: inviting a brand-new user requires
      // GoTrue's admin API (auth.admin.inviteUserByEmail), which has no SQL
      // equivalent. The action itself verifies the caller's own permission
      // via the normal RLS-respecting client BEFORE touching this one --
      // see the file itself and supabase/migrations/*_invite_member_rpc.sql.
      // Kept to this single file, not a directory, so the admin client's
      // use stays enumerable rather than becoming a habit.
      "app/(app)/settings/users/actions.ts",
      // Second exception: the reminder cron processor (Phase 4) has no end
      // user -- it's invoked by a scheduler, not a person -- so there is no
      // JWT to carry and RLS has nothing to resolve auth.uid() against. It
      // must legitimately cross every organization's reminders to find
      // what's due. Authenticated by a shared secret instead of a session --
      // see the file itself.
      "app/api/cron/process-reminders/route.ts",
      // Third exception, same reasoning: overdue-invoice detection (Phase 5)
      // is also a scheduler-invoked job with no end user.
      "app/api/cron/check-overdue-invoices/route.ts",
      // Fourth exception: the payments webhook (Phase 6) is invoked by the
      // payment provider itself, not a signed-in user -- there is no JWT to
      // carry. Authenticated by verifying the provider's signature instead
      // of a session -- see the file itself.
      // Brackets are escaped: unescaped, the glob engine treats
      // "[provider]" as a one-character class ("p","r","o","v",...), not a
      // literal match for the dynamic-segment folder name.
      "app/api/webhooks/payments/\\[provider\\]/route.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated: never hand-edited, and not worth linting.
    "lib/db/types.generated.ts",
  ]),
]);

export default eslintConfig;
