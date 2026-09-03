# CareFlow AI

Multi-tenant, AI-assisted practice-management SaaS — a clinic operating system for dental, medical,
therapy, aesthetic and wellness practices.

One organization holds many clinics; staff hold role-based, clinic-scoped permissions; and patients,
appointments, services, invoices, payments, follow-ups and inventory are connected through a single
data model rather than bolted together as separate features.

## Status

**Phase 1 — Foundation. In progress.**

Task 1.1 (repository scaffold) is complete. The application has no schema, auth, or features yet.

See `docs/MVP_ROADMAP.md` for the phase plan and `CLAUDE.md` for engineering rules.

## Stack

| Layer                     | Choice                                                      |
| ------------------------- | ----------------------------------------------------------- |
| Framework                 | Next.js 16 (App Router, Turbopack)                          |
| Language                  | TypeScript, `strict` + `noUncheckedIndexedAccess`           |
| Styling                   | Tailwind CSS v4                                             |
| Components                | shadcn/ui (Radix base)                                      |
| Database / Auth / Storage | Supabase (PostgreSQL)                                       |
| Data access               | `@supabase/ssr` carrying the end user's JWT, so RLS applies |
| Migrations                | Raw SQL in `supabase/migrations/`, via the Supabase CLI     |
| Package manager           | pnpm                                                        |

## Getting started

Requires Node 20+, pnpm, and Docker (for the local Supabase stack).

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm db:start                # starts local Supabase; prints the URL and keys
pnpm dev                     # http://localhost:3000
```

## Scripts

| Script                                    | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                | Development server                                              |
| `pnpm build`                              | Production build (also regenerates Next's route types)          |
| `pnpm verify`                             | `typecheck` + `lint` + `format:check` — run before every commit |
| `pnpm typecheck`                          | `tsc --noEmit`                                                  |
| `pnpm lint` / `lint:fix`                  | ESLint                                                          |
| `pnpm format` / `format:check`            | Prettier                                                        |
| `pnpm db:start` / `db:stop` / `db:status` | Local Supabase stack                                            |
| `pnpm db:reset`                           | Re-apply all migrations from scratch                            |
| `pnpm db:diff`                            | Diff local schema against migrations                            |
| `pnpm db:types`                           | Regenerate `lib/db/types.generated.ts`                          |

## Security posture

Tenant isolation is enforced **in the database** by Row Level Security, not only in application code.
Four rules carry that guarantee — see `CLAUDE.md` for the full list:

1. The `service_role` key never appears on a request path (enforced by an ESLint rule).
2. RLS is enabled on every table in `public`, asserted in CI.
3. Every view is created `with (security_invoker = on)`.
4. Tenancy identifiers are never trusted from the client — or from AI model output.

The authorization test suite is a **merge gate**: any migration touching a policy must pass the full
negative-security matrix before merge.

## Layout

```
app/          routes — (auth), (onboarding), (app) shell, api/
components/   ui/ (shadcn), layout/, patterns/ (shared building blocks)
features/     per-domain components and queries
lib/          supabase/, auth/, db/, validation/, providers/, ai/
supabase/     migrations/ and seed data
tests/        unit/, rls/ (pgTAP), e2e/ (Playwright)
docs/         the 8 product & architecture specifications
```

## Documentation

`docs/AUTHORIZATION.md` is the governing document for all access control. `CLAUDE.md` records the
engineering conventions, the deliberate deviations from the specs, and the open questions that still
need answers.
