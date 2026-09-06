# AI Assistant (Phase 9)

Module reference for `lib/ai/`, `lib/providers/ai/`, `app/(app)/assistant`, and `app/api/ai/*`.

Read `CLAUDE.md`'s "Deliberate deviations" section first for the scope decisions this phase made.
`docs/AI_TOOLS.md` is the frozen original spec; this file is the living reference for what was
actually built and where it diverges.

## Architecture

```
UI (app/(app)/assistant, client chat component)
  ↓ POST /api/ai/chat { conversationId?, message }
lib/ai/context.ts        -- resolves org/permissions/clinics/currency/timezone from the SESSION,
                             never from the request body (CLAUDE.md rule 4)
  ↓
lib/ai/service.ts         -- runAssistantTurn(): persist → provider.generateReply() → execute
                             tool_use blocks → persist tool_result → loop until end_turn
  ↓                     ↓
lib/providers/ai/*    lib/ai/tools/registry.ts  -- permission check → Zod validate → execute → audit
  ↓                     ↓
Anthropic API         app/(app)/**/queries.ts and actions.ts -- the SAME functions every human-facing
(or NotConfigured)       page/Server Action already calls (Phase 5-8), never a parallel implementation
```

No new authorization primitive exists. Every tool call re-derives context via `resolveAIContext()`
(itself built from `getAuthContext()`, `getPermissionSet()`, `getReportingContext()` -- Phase 1/8's own
helpers) and every permission check goes through the same `Permission` catalogue and `has_permission()`
RPC every Server Action uses. RLS is unchanged and unaware that a request originated from the AI --
that is intentional: the AI is a new *caller* of the existing system, not a new privilege domain.

## Database (migration `20260908090000_ai_assistant_core.sql`)

Four tables, all RLS-enabled, none exposed to any new PostgREST surface beyond what every other table
already gets:

- **`ai_conversations`** -- one row per chat thread. **Private to the user who started it**, not
  shared across the organization the way business tables are (`ai_conversations_select` filters on
  `user_id = auth.uid()` alone) -- an operational assistant's chat history is not team-shared data.
  `ai.use` (seeded in migration `20260903072300`) plus real organization membership gates creation.
- **`ai_messages`** -- one row per turn. `content` is the raw Anthropic content-block array (text /
  tool_use / tool_result), stored as-is so a conversation replays to the provider byte-for-byte on the
  next turn. Append-only: `revoke update, delete`.
- **`ai_tool_calls`** -- one row per tool invocation, independent of the JSONB in `ai_messages`, so
  "which tools ran, with what input, success or failure" (`AI_TOOLS.md` section 22) is directly
  queryable without parsing message content. Append-only.
- **`ai_usage`** -- one row per provider request: model, input/output token counts. Append-only, for
  future cost-visibility UI (none exists yet -- see Deferred).

**Tenancy stamping, not client trust.** `ai_messages`/`ai_tool_calls` both carry `organization_id`/
`user_id`, but a client can never set them meaningfully: a `BEFORE INSERT` trigger
(`ai_stamp_tenancy_from_conversation`, `SECURITY DEFINER`) overwrites both from the parent
`ai_conversations` row before the `WITH CHECK` policy evaluates. This is the same pattern this
codebase already uses for derived financial columns (invoice rollup triggers) applied to tenancy
instead of money -- proven in `supabase/tests/ai_assistant_test.sql` by inserting with a
**deliberately wrong** `organization_id`/`user_id` and asserting the *stored* row carries the real
ones, and separately that a second user cannot hijack a first user's conversation by targeting its id.

**A column-specific `revoke update (col)` does not work** when a table-level UPDATE grant already
exists (Supabase's platform default for every new table) -- confirmed the hard way here (first pgTAP
run: 12 failures) before finding the exact same gotcha already documented in migration
`20260903083134`'s own comment. Fixed by revoking the table-level grant entirely and re-granting only
the columns that should be client-editable (`ai_conversations`: `title`, `deleted_at`).

## Provider abstraction (`lib/providers/ai/`)

Third instance of this codebase's provider-interface pattern (`PaymentProvider`, `MessagingProvider`,
now `AIProvider`) -- `lib/ai/service.ts` never imports `@anthropic-ai/sdk` directly. `getAIProvider()`
returns `AnthropicAIProvider` when `ANTHROPIC_API_KEY` is set, else `NotConfiguredAIProvider`, which
returns an honest "not configured" error rather than fabricating a reply -- matching
`lib/providers/payment/not-configured.ts` exactly. **In this environment `ANTHROPIC_API_KEY` is unset**,
so the assistant is wired end-to-end but inert until a key is supplied.

Model defaults to `claude-sonnet-5` (`AI_MODEL` env var, already present in `.env.example` from Phase
1's planning) -- non-streaming: each `generateReply()` call is a single `messages.create()`, and
`lib/ai/service.ts` loops calling it again after executing any `tool_use` blocks, up to
`MAX_TOOL_ITERATIONS` (6) per user turn.

## Tool registry (`lib/ai/tools/`)

17 read-only tools (`docs/AI_TOOLS.md` section 4/6-13) plus 7 action tools (section 16), all listed in
`lib/ai/tools/registry.ts`. Every read tool is a thin, Zod-validated, permission-gated wrapper around
an **existing** Phase 5-8 query function (`app/(app)/reports/*-queries.ts`, `app/(app)/*/queries.ts`)
-- no tool recomputes a KPI; `get_revenue_summary` calls the exact `getRevenueSummary()` the Financial
Reports page calls, so the assistant and the dashboard can never disagree.

### Tool → permission mapping

| Tool | Permission(s) | Action? |
|---|---|---|
| `get_dashboard_summary` | `reports.view` (financial fields additionally need `reports.financial`) | |
| `get_revenue_summary` | `reports.financial` | |
| `get_unpaid_invoices` | `reports.financial` | |
| `get_payment_summary` | `reports.financial` | |
| `get_sales_summary` | `reports.financial` | |
| `get_appointments` | `appointments.view` | |
| `get_upcoming_appointments` | `appointments.view` | |
| `search_patients` | `patients.view` or `patients.view.assigned` | |
| `get_patient` | `patients.view` or `patients.view.assigned` (history/follow-ups/financial fields additionally need `appointments.view`/`followups.view`/`reports.financial`) | |
| `get_patient_history` | `patients.view` or `patients.view.assigned` | |
| `get_followups` | `followups.view` | |
| `get_overdue_followups` | `followups.view` | |
| `get_inventory_status` | `inventory.view` | |
| `get_low_stock_items` | `inventory.view` | |
| `get_inventory_usage` | `inventory.view` | |
| `get_clinic_performance` | `reports.view` | |
| `get_practitioner_performance` | `reports.view` | |
| `create_appointment` | `appointments.create` | ✓ |
| `reschedule_appointment` | `appointments.reschedule` | ✓ |
| `create_followup` | `followups.create` | ✓ |
| `create_invoice` | `invoices.create` | ✓ |
| `record_payment` | `payments.record_manual` | ✓ |
| `create_purchase_order` | `purchase_orders.manage` | ✓ |
| `send_reminder` | `reminders.manage` | ✓ |

Every tool also implicitly requires `ai.use`, checked once per chat request before any tool runs.

**Tenancy is never a tool input.** No tool schema has an `organization_id` field, ever --
`docs/AI_TOOLS.md` section 6 nominally lists one as a possible `get_dashboard_summary` input, but that
would let a compromised or confused model specify a foreign tenant; this app's own
`CLAUDE.md`/`AUTHORIZATION.md` rule ("tenancy arguments are stripped from AI tool schemas and injected
from context") governs instead, and every tool resolves its organization from `AIContext`
(`lib/ai/context.ts`), never from model input. An optional `clinicId` *filter* exists on most tools,
validated against the caller's own authorized clinic list (`resolveClinicId()`) -- not a trust boundary,
since RLS filters the underlying query regardless, but it turns "silently empty result" into a clear
tool error when the model names an inaccessible or nonexistent clinic.

**Any-of permissions.** A `ReadTool`'s `permission` field accepts a single `Permission` or an array
(any-of) -- `search_patients`/`get_patient`/`get_patient_history` accept `patients.view` **or**
`patients.view.assigned`, matching `AUTHORIZATION.md` section 5.6's broad/assigned split; RLS still
scopes the actual rows returned regardless of which branch grants tool access, exactly as it does for
the human-facing `/patients` page.

**Field-level projection**, not a separate per-role tool: `get_patient` conditionally includes
appointment history / follow-ups / financial summary based on which of `appointments.view` /
`followups.view` / `reports.financial` the caller separately holds (`AI_TOOLS.md` section 10) --
resolved inside the one handler, not three different tools.

### Action tools: propose → confirm → execute → audit

Every action tool (`create_appointment`, `reschedule_appointment`, `create_followup`,
`create_invoice`, `record_payment`, `create_purchase_order`, `send_reminder`) has two functions:

- **`propose(input, ctx)`** -- looks up just enough display context (patient/clinic/staff name) to
  phrase a confirmation sentence, **performs no write**. Called from the normal chat tool loop; its
  result (`{ requiresConfirmation: true, summary, details, input }`) is what comes back as the
  `tool_result` the model sees, and is separately surfaced to the client as a `pendingActions` entry on
  the chat response.
- **`execute(input, ctx)`** -- calls the **same Server Action** a human clicking a button would call
  (`createAppointmentAction`, `recordManualPaymentAction`, etc.) -- never a parallel write path, never
  a raw RPC the UI doesn't also use. Only reachable via `POST /api/ai/actions/confirm`, which
  independently re-checks `ai.use` + the tool's permission and re-validates input with the exact same
  Zod schema -- a prior "success" proposal is never treated as a standing capability grant.

`send_reminder` deserves a note: there is no existing "send this reminder right now" Server Action to
reuse (patient-facing reminders are sent only by the `app/api/cron/process-reminders` service-role job
on their `scheduled_for` time). Rather than build a new send path bypassing that job (which would mean
a second `MessagingProvider` call site and, per `CLAUDE.md`'s non-negotiable rule 1, no service-role
key may sit on a request path), this tool moves the existing `reminders.scheduled_for` to `now()` via
the normal RLS-respecting client, so the **existing** cron job picks it up on its next run. Fixing/
reusing existing architecture rather than adding an AI-specific workaround, per this phase's own
section 66.

## UI (`app/(app)/assistant`)

`page.tsx` is a Server Component: resolves auth, calls `requirePermission("ai.use", ...)` (the same
direct-URL guard every other permission-gated page uses), loads the latest conversation's text-only
history, and passes it as plain serializable props to `assistant-chat.tsx` (`"use client"`) -- no
function crosses that boundary, the exact lesson from this phase's `TrendChart` fix earlier in the
session. The client component posts to `/api/ai/chat`, renders the reply, and renders any
`pendingActions` as inline confirm/cancel cards that call `/api/ai/actions/confirm` directly.

## Permissions

No new permission was added -- `ai.use` already existed (seeded migration `20260903072300`, granted to
admin/clinic_manager/practitioner/receptionist/finance/inventory_manager) and gates both the
`/assistant` nav item (`lib/navigation.ts`, pre-existing) and every chat request. Individual tools
additionally gate on their own domain permission (`reports.financial`, `patients.view`,
`inventory.view`, etc.) via the SAME `Permission` catalogue (`lib/auth/permissions.ts`) -- no
AI-specific permission was invented for any tool.

## Testing

- `supabase/tests/ai_assistant_test.sql` (20 pgTAP assertions): conversation privacy (same-org peer
  cannot see another user's conversation), cross-org denial, the tenancy-stamping trigger under a
  deliberately spoofed payload, cross-user message/tool-call hijack denial, append-only enforcement
  (update and delete both denied), column immutability, and `ai.use`-gated + real-membership-gated
  conversation creation. All 216 project-wide pgTAP assertions pass (`pnpm test:rls`).
- Structural RLS-enabled coverage for the four new tables comes for free from
  `authorization_test.sql`'s existing generic "every public table has RLS" check.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass with the new routes present
  (`/assistant`, `/api/ai/chat`, `/api/ai/actions/confirm`).

## Deferred

- **Token-level streaming to the browser.** `generateReply()` is non-streaming; a chat response
  returns only once the full tool loop for that turn completes. Responses are short operational
  answers, not long-form generation, so this is a correctness-first choice (section 40's own rule),
  not an oversight -- upgrading to SSE later is additive to `app/api/ai/chat/route.ts` alone.
  `docs/AI_TOOLS.md` never mandates streaming; the underlying `AIProvider` interface would need a
  second method (or a streaming variant) to add it.
- **Multi-conversation UI.** The chat page shows and continues the user's single most recent
  conversation; there is no thread list/switcher yet. `lib/ai/service.ts#listConversations` already
  exists for when that UI is built.
- **Pending confirmations do not survive a page reload.** `getConversationDisplayMessages()`
  reconstructs only text turns for the initial render; a proposed-but-not-yet-confirmed action from a
  previous page load is not restored as a confirm/cancel card (the user would need to ask again).
  Nothing is silently lost server-side -- the full tool_use/tool_result JSON is still in `ai_messages`
  -- this is a display-layer simplification, not a data gap.
- **Dashboard AI insights (section 14).** Not built this phase; `lib/ai/tools/read-financial.ts`'s
  `get_dashboard_summary` already returns exactly the shape a future insight card would need, sourced
  from the same `getDashboardSummary()` the dashboard itself calls.
- **Usage/cost visibility UI.** `ai_usage` rows are recorded on every request; no settings page
  renders them yet.
- **Rate limiting.** No per-user/per-org request throttle exists on `/api/ai/chat` yet -- `ai.use` and
  each tool's own permission are the only gates today.
