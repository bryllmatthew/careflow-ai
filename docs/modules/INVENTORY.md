# Inventory & Supplies (Phase 7)

Module reference for `supabase/migrations/20260907090000_inventory_core.sql`. Read `CLAUDE.md`'s
"Deliberate deviations" section first — several Phase 7 scope decisions are recorded there, not
repeated here.

## Entities

| Table                | Scope        | Notes                                                                 |
| --------------------- | ------------ | ---------------------------------------------------------------------- |
| `suppliers`           | organization | Vendors. Deactivated via `status`, never deleted.                     |
| `products`            | organization | The catalogue. **No `clinic_id`** — the same SKU is not duplicated per clinic. `unit_cost`/`selling_price` are the *current* catalogue values; historical transactions snapshot their own. |
| `inventory`           | clinic       | One row per `(clinic_id, product_id)`. `quantity_on_hand` is derived — see "Stock movement rules." |
| `inventory_batches`   | clinic       | Batch/lot/expiration records, created only for `track_expiration = true` products on receiving. |
| `inventory_movements` | clinic       | The append-only ledger. Every stock-changing event, ever, with a before/after snapshot. |
| `service_products`    | organization | "Service → Required Supplies" — read by `consume_inventory_for_appointment()`. |
| `purchase_orders`     | clinic       | `subtotal`/`tax_amount`/`total` are derived from `purchase_order_items`, same shape as invoices. |
| `purchase_order_items`| clinic       | `quantity_received` is derived — written only by `receive_purchase_order_item()`. |

## Stock movement rules

`inventory.quantity_on_hand` is never a direct client write (it's off the column grant — see the RLS
section of the migration). Every change goes through one of five `SECURITY DEFINER` RPCs, each of
which writes the `inventory` row **and** an `inventory_movements` row in the same transaction:

- `receive_stock(clinic_id, product_id, quantity, ...)` — manual receiving, not tied to a PO.
- `adjust_inventory(clinic_id, product_id, quantity_delta, movement_type, reason, batch_id?)` —
  `manual_adjustment` / `damaged` / `expired` / `return` / `correction`. `reason` is required.
- `transfer_inventory(from_clinic_id, to_clinic_id, product_id, quantity, notes?)` — atomic; writes a
  linked `transfer_out` + `transfer_in` pair sharing one `transfer_group_id`. Locks both `inventory`
  rows in a `clinic_id`-ordered sequence to avoid deadlocking against a concurrent reverse transfer.
- `consume_inventory_for_appointment(appointment_id)` — see "Service consumption" below.
- `receive_purchase_order_item(item_id, quantity, ...)` — see "Purchase receiving" below.

Stock is never allowed to go negative (`quantity_on_hand >= 0` is a hard `CHECK`, and every RPC
validates before writing). This is a fixed MVP rule, not configurable — the RPCs are structured so a
future "allow negative inventory" org setting would be a single added condition per function, not a
redesign.

Every RPC row-locks the `inventory` row (`SELECT ... FOR UPDATE`) before validating the new quantity,
so two concurrent operations against the same row serialize correctly — the second reads the
post-lock balance, not the stale one. Verified live: two simultaneous `-5` adjustments against 8
units on hand left exactly one successful (`3` remaining), never both.

## Service consumption behavior

`consume_inventory_for_appointment(appointment_id)` is called once, from
`app/(app)/appointments/actions.ts`'s `updateAppointmentStatusAction()`, immediately after an
appointment's status is set to `'completed'`.

- It is a **no-op** (zero rows, no error) unless the appointment's status is actually `'completed'` —
  never fires for `cancelled`, `no_show`, or any other status.
- For each `service_products` row on the appointment's service, it locks that product's inventory row,
  validates sufficient stock, decrements it, and writes a `service_usage` movement referencing
  `(reference_type='appointment', reference_id=<appointment id>)`.
- **Idempotent**: a unique partial index
  (`inventory_movements_appointment_product_uk on (reference_id, product_id) where reference_type =
  'appointment' and movement_type = 'service_usage'`) means a second call for the same appointment
  raises `23505` on the first product, aborting the whole call — the caller
  (`safeConsumeInventory()` in `appointments/actions.ts`) treats that as "already consumed," not an
  error.
- **Insufficient stock aborts the whole call** (all-or-nothing, not partial deduction across
  products) and never rolls back the appointment's own `'completed'` status — the appointment already
  happened clinically. The shortfall is instead surfaced via an `inventory_consumption_failed`
  notification to the staff member who completed it.
- Authorization is `SECURITY DEFINER` with an internal check (`appointments.update` OR
  `inventory.manage` on that clinic) — the person completing an appointment (typically front desk)
  does not hold `inventory.manage`, and requiring it would be the wrong permission for a
  system-triggered side effect of completion.

## Purchase receiving

`purchase_orders.status`: `draft` → `ordered` → `partially_received`/`received`, or `cancelled` from
any non-terminal state. (No separate "submitted" step — see `CLAUDE.md`.) The
`purchase_order_number` is assigned atomically at the `draft → ordered` transition, using the same
`document_counters` mechanism as `invoice_number` — an abandoned draft never burns a number.

`receive_purchase_order_item(item_id, quantity, batch_number?, lot_number?, expiration_date?, notes?)`:

- Rejects receiving more than `quantity_ordered - quantity_received` remaining on the line.
- Rejects receiving against a PO not in `ordered`/`partially_received`.
- Increases `inventory.quantity_on_hand`, writes a `purchase_received` movement referencing
  `(reference_type='purchase_order', reference_id=<PO id>)`, and creates an `inventory_batches` row
  when the product tracks expiration and an expiration date was given.
- Updates `purchase_order_items.quantity_received` and recomputes the parent PO's status
  (`received` once every line is fully received, `partially_received` otherwise) in the same
  transaction.

## Transfer logic

See "Stock movement rules" above — `transfer_inventory()` is atomic and creates two linked movements.
Rejects: same source/destination clinic, insufficient stock at the source, or a destination clinic in
a different organization than the source.

## Low-stock behavior

`inventory.is_low_stock` is a **generated column** (`quantity_on_hand <= reorder_level`), not computed
client-side — PostgREST filters can only compare a column against a supplied literal, never against
another column, so a real boolean column is what `/inventory`'s status filter and the dashboard's
low-stock count both query.

Notifications (`inventory_low_stock` / `inventory_out_of_stock`) fire only on the **crossing** —
`quantity_before` was above the line, `quantity_after` is at or below it — via
`app.check_stock_alert()`, called from every stock-decreasing RPC. Staying below the threshold on a
subsequent decrease does not re-fire. Recipients are every user holding `inventory.manage` at that
clinic's scope (org-wide or clinic-specific), resolved via a `SECURITY DEFINER` fan-out
(`app.notify_inventory_managers()`) rather than an exposed "who holds permission X" RPC. These are
internal notifications only (`public.create_notification()`) — no external channel is configured or
faked.

## Expiration behavior

`inventory_batches.expiration_date` drives `lib/validation/inventory.schema.ts`'s
`expirationStatus()`: `expired` (date has passed), `expiring_soon` (within `EXPIRING_SOON_DAYS`,
currently 30, centralized in that one constant), or `valid`. Expired stock is never deleted or
hidden — it stays fully visible and auditable in the product detail page's Batches tab, the
`/inventory` list's expiration filter, and the Expiration tab of `/reports/inventory`. There is no
proactive push notification for expiration (see `CLAUDE.md`'s deviation note).

## Permissions

No new permissions were added this phase — `inventory.view`, `inventory.manage`, `products.manage`,
`suppliers.view`, `suppliers.manage`, `purchase_orders.view`, `purchase_orders.manage`, and
`reports.inventory` were all seeded and granted to `owner`/`admin`/`clinic_manager`/
`inventory_manager` back in migration 0002 (`docs/AUTHORIZATION.md`'s Inventory Manager role existed
from Phase 1). `practitioner`, `receptionist`, and `finance` hold none of them, matching
`AUTHORIZATION.md`'s explicit Cannot lists.

## Events

`inventory_low_stock`, `inventory_out_of_stock`, and `inventory_consumption_failed` are internal
notification types (`notifications.type`). There is no generic inventory event bus — low-stock
notifications are embedded directly in the stock RPCs (same reasoning Phase 6 used for
`payment.succeeded`: "nothing configurable about it," so it bypasses the `automation_rules` engine
rather than adding a new `action_type` to it).

## Important business rules

- Every stock-quantity change has a corresponding `inventory_movements` row. There is no code path
  that updates `quantity_on_hand` without one — enforced structurally (the column is off the client
  grant; only the `SECURITY DEFINER` RPCs, which always write both, can touch it).
- `inventory_movements` is append-only: no `UPDATE`/`DELETE` RLS policy exists for `authenticated`, at
  all. Corrections are new `correction` movements, never edits to history.
- Product cost changes never rewrite historical `inventory_movements.unit_cost` or
  `purchase_order_items.unit_cost` — those are snapshots taken at the time of the transaction.
- Inventory value (`/inventory`'s summary card and the dashboard widget) is `quantity_on_hand ×
  products.unit_cost`, summed — never a "market value." Gated by `reports.inventory`.
- Sales integration: Phase 5/6 never added a `product_id` to `invoice_items` (see `CLAUDE.md`), so
  there is no invoice-driven inventory deduction yet. The integration point is deliberately left
  clean rather than retrofitted with unsupported behavior — a future phase adding retail product line
  items to invoices should trigger inventory consumption on a real "sale completed" event, not on
  draft creation, mirroring how appointment completion (not booking) triggers service consumption
  here.
