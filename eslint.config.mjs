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
    files: ["scripts/**/*.{ts,tsx,mts,mjs}", "supabase/**/*.{ts,mts,mjs}"],
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
