-- ============================================================================
-- Phase 7 — Inventory & Supplies Management
--
-- docs/PRODUCT_SPEC.md / the Phase 7 implementation prompt. Builds the
-- operational chain: Service -> Required Supplies -> Inventory Deduction ->
-- Inventory Movement -> Low Stock Alert, and Purchase Order -> Stock
-- Received -> Inventory Increase.
--
-- Authorization note: `inventory.view`, `inventory.manage`, `products.manage`,
-- `suppliers.view`, `suppliers.manage`, `purchase_orders.view`,
-- `purchase_orders.manage` and `reports.inventory` were ALL already seeded
-- into `permissions` and granted to owner/admin/clinic_manager/
-- inventory_manager by migration 0002 (docs/AUTHORIZATION.md's Inventory
-- Manager role existed from Phase 1). No new permissions or role_permissions
-- rows are needed this phase -- this migration only adds the tables and RPCs
-- those permissions gate. See CLAUDE.md "Adapt to the existing codebase
-- rather than unnecessarily replacing working architecture."
--
-- Deliberate deviations, recorded here rather than only in code:
--  * `products` is org-level (no clinic_id), matching CLAUDE.md's existing
--    deviation note -- the same SKU is not duplicated per clinic.
--  * `products.category` is a free-text column, not a separate
--    product_categories table -- organizations type whatever they want; nothing
--    forces a curated list, and there is no category CRUD to build/maintain.
--  * A product has at most one preferred supplier (products.supplier_id),
--    not a many-to-many product_suppliers join -- matches
--    docs/DATABASE_SCHEMA.md's own product field list and section 22's "do
--    not over-engineer procurement."
--  * purchase_orders.status collapses the prompt's Draft/Submitted/Ordered
--    distinction into draft -> ordered -> partially_received/received (or
--    cancelled) -- there is no separate internal-approval workflow being
--    built, and section 23 itself says "do not add unnecessary procurement
--    workflows."
--  * Batch/lot tracking (inventory_batches) is populated on RECEIVING
--    (purchase or manual) for traceability and expiration reporting, but
--    automatic consumption (service usage) decrements only the aggregate
--    inventory.quantity_on_hand, not a specific batch via FEFO allocation.
--    Section 14 explicitly rules out "a highly complex pharmaceutical
--    inventory system"; batch-specific write-offs remain possible manually
--    via adjust_inventory's optional p_batch_id.
--  * No proactive "expiring soon / just expired" cron notification this
--    phase -- expiration status is fully live-visible in every list/detail
--    view (section 15's actual requirement), but the push-notification half
--    of section 37's inventory.expired event is deferred alongside Phase 8's
--    broader reporting/dashboards work, not invented ahead of it.
--  * No product line items on invoices yet (Phase 5/6 deviation already
--    recorded: invoice_items has no product_id). Section 39's integration
--    point is intentionally left clean rather than retrofitted -- retail
--    sales-through-invoice inventory deduction is a Phase 8+ decision.
--  * No global search integration (section 28) -- no ⌘K/global search feature
--    exists yet anywhere in the app to integrate with.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- notifications.type gets two new, crossing-triggered values. Embedded
-- directly in the stock-mutating RPCs below (app.check_stock_alert), the
-- same reasoning Phase 6 used for payment.succeeded/failed: "nothing
-- configurable about it," so this bypasses the automation_rules engine
-- entirely rather than adding a new action_type to it.
-- ----------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'followup_due', 'followup_overdue', 'reminder_failed',
    'appointment_cancelled', 'appointment_rescheduled', 'no_show_followup_created',
    'payment_succeeded', 'payment_failed', 'payment_refunded',
    'inventory_low_stock', 'inventory_out_of_stock', 'inventory_consumption_failed'
  ));

-- document_counters gets a second document_type -- purchase order numbering
-- reuses the exact race-free/gap-free mechanism invoice numbering already
-- proved out (migration 0015).
alter table public.document_counters drop constraint document_counters_document_type_check;
alter table public.document_counters add constraint document_counters_document_type_check
  check (document_type in ('invoice', 'purchase_order'));

-- ----------------------------------------------------------------------------
-- suppliers
-- ----------------------------------------------------------------------------

create table public.suppliers (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  name              text        not null check (length(btrim(name)) between 1 and 200),
  contact_person    text,
  email             text,
  phone             text,
  address           text,
  notes             text,
  status            text        not null default 'active' check (status in ('active', 'inactive')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint suppliers_id_org_uk unique (id, organization_id)
);

comment on table public.suppliers is
  'Organization-level. docs/AUTHORIZATION.md Inventory Manager role. Never hard-deleted -- see status.';

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create index suppliers_org_ix on public.suppliers (organization_id);
create index suppliers_org_status_ix on public.suppliers (organization_id, status);

-- ----------------------------------------------------------------------------
-- products — org-level catalogue (CLAUDE.md deviation: not clinic-level).
-- ----------------------------------------------------------------------------

create table public.products (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,
  sku                 text,
  barcode             text,
  name                text        not null check (length(btrim(name)) between 1 and 200),
  description         text,
  -- Free text -- section 5: "do not hardcode categories in a way that
  -- prevents organizations from creating their own." The UI offers a
  -- suggested list; nothing here constrains it.
  category            text,
  brand               text,
  unit_of_measure     text        not null default 'unit'
                                  check (length(btrim(unit_of_measure)) between 1 and 40),
  -- The CURRENT catalogue cost/price -- inventory_movements snapshots its own
  -- unit_cost at the time of each transaction, so changing this later never
  -- rewrites historical movement/PO values (CLAUDE.md "historical values
  -- must remain stable").
  unit_cost           numeric(14, 2) not null default 0 check (unit_cost >= 0),
  selling_price       numeric(14, 2) check (selling_price is null or selling_price >= 0),
  currency            text        not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  track_inventory     boolean     not null default true,
  track_expiration    boolean     not null default false,
  -- Defaults copied onto a clinic's inventory row the first time it's
  -- created for this product (see the stock RPCs below) -- a clinic can then
  -- override its own reorder_level/reorder_quantity independently.
  reorder_level       numeric(14, 3) not null default 0 check (reorder_level >= 0),
  reorder_quantity    numeric(14, 3) not null default 0 check (reorder_quantity >= 0),
  supplier_id         uuid,
  supplier_sku        text,
  status              text        not null default 'active' check (status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint products_id_org_uk unique (id, organization_id),
  constraint products_supplier_fk foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id) on delete set null
);

comment on table public.products is
  'Org-level catalogue (docs/CLAUDE.md deviation: not clinic-level, so the same SKU is not duplicated per clinic). Per-clinic stock lives in inventory.';

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create index products_org_ix on public.products (organization_id);
create index products_org_status_ix on public.products (organization_id, status);
create index products_supplier_ix on public.products (supplier_id) where supplier_id is not null;

create unique index products_org_sku_uk on public.products (organization_id, lower(sku))
  where sku is not null;
create unique index products_org_barcode_uk on public.products (organization_id, barcode)
  where barcode is not null;

-- ----------------------------------------------------------------------------
-- inventory — one row per (clinic, product): per-clinic stock (section 6).
-- quantity_on_hand is DERIVED -- never a direct client write. Every change
-- goes through a SECURITY DEFINER RPC below that also writes the
-- corresponding inventory_movements row, same "never overwrite a quantity
-- without recording why" discipline as invoices.total/payments.amount_paid.
--
-- No reserved_quantity/available_quantity: no reservation system exists in
-- this phase (section 6: "do not create fake reservation functionality"), so
-- available == quantity_on_hand.
-- ----------------------------------------------------------------------------

create table public.inventory (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  product_id        uuid        not null,
  quantity_on_hand  numeric(14, 3) not null default 0 check (quantity_on_hand >= 0),
  reorder_level     numeric(14, 3) not null default 0 check (reorder_level >= 0),
  reorder_quantity  numeric(14, 3) not null default 0 check (reorder_quantity >= 0),
  -- Generated, not computed in application code -- PostgREST filters can only
  -- compare a column against a client-supplied literal, never against
  -- another column, so "low stock" needs a real boolean column to query on
  -- (`.eq("is_low_stock", true)`), not a `quantity_on_hand <= reorder_level`
  -- expression built client-side.
  is_low_stock      boolean generated always as (quantity_on_hand <= reorder_level) stored,
  last_received_at  timestamptz,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint inventory_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint inventory_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id),
  constraint inventory_org_clinic_product_uk unique (organization_id, clinic_id, product_id)
);

comment on table public.inventory is
  'Per-clinic stock levels. quantity_on_hand is derived -- written only by the stock RPCs in this migration, never directly by a client.';

create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

create index inventory_clinic_ix on public.inventory (clinic_id);
create index inventory_product_ix on public.inventory (product_id);
create index inventory_low_stock_ix on public.inventory (clinic_id) where is_low_stock;

-- ----------------------------------------------------------------------------
-- inventory_batches — batch/lot/expiration tracking (section 14), populated
-- only for products with track_expiration = true. Section 14: "do not force
-- expiration tracking on every product."
-- ----------------------------------------------------------------------------

create table public.inventory_batches (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,
  clinic_id           uuid        not null,
  product_id          uuid        not null,
  batch_number        text,
  lot_number          text,
  expiration_date     date,
  quantity_remaining  numeric(14, 3) not null default 0 check (quantity_remaining >= 0),
  unit_cost           numeric(14, 2),
  received_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint inventory_batches_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint inventory_batches_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id)
);

comment on table public.inventory_batches is
  'Batch/lot/expiration records, created on receiving for track_expiration products. Never deleted when expired -- section 15: "expired inventory must remain auditable."';

create trigger inventory_batches_set_updated_at
  before update on public.inventory_batches
  for each row execute function public.set_updated_at();

create index inventory_batches_clinic_product_ix on public.inventory_batches (clinic_id, product_id)
  where quantity_remaining > 0;
create index inventory_batches_expiration_ix on public.inventory_batches (expiration_date)
  where expiration_date is not null and quantity_remaining > 0;

-- ----------------------------------------------------------------------------
-- inventory_movements — the append-only ledger (section 8). Every
-- stock-changing event, ever, with a before/after snapshot. No UPDATE/DELETE
-- policy, ever -- corrections are new CORRECTION movements, the same
-- append-only discipline as payments (migration 0016).
-- ----------------------------------------------------------------------------

create table public.inventory_movements (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  product_id        uuid        not null,
  movement_type     text        not null check (movement_type in (
                                  'purchase_received', 'sale', 'service_usage', 'manual_adjustment',
                                  'transfer_in', 'transfer_out', 'return', 'damaged', 'expired', 'correction'
                                )),
  -- Signed: positive for stock-increasing movements, negative for
  -- stock-decreasing ones. before/after make the sign redundant for display
  -- but this is what before+quantity=after is checked against below.
  quantity          numeric(14, 3) not null check (quantity <> 0),
  quantity_before   numeric(14, 3) not null check (quantity_before >= 0),
  quantity_after    numeric(14, 3) not null check (quantity_after >= 0),
  unit_cost         numeric(14, 2),
  total_cost        numeric(14, 2),
  reference_type    text        check (reference_type in ('purchase_order', 'appointment', 'transfer', 'manual')),
  reference_id      uuid,
  batch_number      text,
  lot_number        text,
  expiration_date   date,
  -- Links a TRANSFER_OUT row to its paired TRANSFER_IN row (section 9).
  transfer_group_id uuid,
  notes             text,
  created_by        uuid        references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint inventory_movements_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint inventory_movements_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id),
  constraint inventory_movements_before_after_consistent
    check (quantity_after = quantity_before + quantity)
);

comment on table public.inventory_movements is
  'Append-only stock ledger (section 8/33). Written only by the stock RPCs below -- never directly by a client, and never updated or deleted.';

create index inventory_movements_org_ix on public.inventory_movements (organization_id);
create index inventory_movements_clinic_product_ix
  on public.inventory_movements (clinic_id, product_id, created_at desc);
create index inventory_movements_type_ix on public.inventory_movements (movement_type);
create index inventory_movements_reference_ix
  on public.inventory_movements (reference_type, reference_id) where reference_type is not null;

-- Idempotency (section 35): the same appointment can never deduct the same
-- product twice, no matter how many times appointment.completed fires or is
-- retried. A second attempt's insert raises 23505, which the caller treats
-- as "already consumed," not an error -- the same pattern reminders/
-- follow_ups (migration 0014) and payments/webhook_events (migration 0016)
-- already use.
create unique index inventory_movements_appointment_product_uk
  on public.inventory_movements (reference_id, product_id)
  where reference_type = 'appointment' and movement_type = 'service_usage';

-- ----------------------------------------------------------------------------
-- service_products — "Service -> Required Supplies" (section 11). CLAUDE.md
-- already anticipated this table name in its deviations list.
-- ----------------------------------------------------------------------------

create table public.service_products (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  service_id        uuid        not null,
  product_id        uuid        not null,
  quantity          numeric(14, 3) not null check (quantity > 0),
  notes             text,
  created_at        timestamptz not null default now(),

  constraint service_products_service_fk foreign key (service_id, organization_id)
    references public.services (id, organization_id) on delete cascade,
  constraint service_products_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id),
  -- One line per (service, product) -- increase quantity instead of adding
  -- a duplicate row.
  constraint service_products_uk unique (service_id, product_id)
);

comment on table public.service_products is
  'Required supplies for a service (section 11). Read by consume_inventory_for_appointment() on appointment completion.';

create index service_products_service_ix on public.service_products (service_id);
create index service_products_product_ix on public.service_products (product_id);

-- ----------------------------------------------------------------------------
-- purchase_orders
-- ----------------------------------------------------------------------------

create table public.purchase_orders (
  id                     uuid        primary key default gen_random_uuid(),
  organization_id        uuid        not null references public.organizations (id) on delete cascade,
  clinic_id              uuid        not null,
  supplier_id            uuid        not null,
  -- Null while draft; assigned by app.assign_purchase_order_number() the
  -- moment status transitions to 'ordered' -- same discipline as
  -- invoice_number (migration 0015), for the same reason: an abandoned
  -- draft must never burn a number.
  purchase_order_number  text,
  status                 text        not null default 'draft'
                                     check (status in (
                                       'draft', 'ordered', 'partially_received', 'received', 'cancelled'
                                     )),
  order_date             date,
  expected_date          date,
  notes                  text,
  -- subtotal/tax_amount/total are DERIVED by
  -- app.recompute_purchase_order_totals() from purchase_order_items, same
  -- shape as invoices' own totals (migration 0015) -- never client-written.
  subtotal               numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax_rate               numeric(5, 2)  not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount             numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total                  numeric(14, 2) not null default 0 check (total >= 0),
  created_by             uuid        references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint purchase_orders_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint purchase_orders_supplier_fk foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id),
  constraint purchase_orders_total_consistent check (total = round(subtotal + tax_amount, 2)),
  constraint purchase_orders_id_org_clinic_uk unique (id, organization_id, clinic_id)
);

comment on table public.purchase_orders is
  'docs/PRODUCT_SPEC.md-adjacent (section 23). status collapses Submitted/Ordered into one transition -- see this migration''s header comment.';

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create index purchase_orders_org_ix on public.purchase_orders (organization_id);
create index purchase_orders_clinic_status_ix on public.purchase_orders (clinic_id, status);
create index purchase_orders_supplier_ix on public.purchase_orders (supplier_id);

create unique index purchase_orders_org_number_uk
  on public.purchase_orders (organization_id, purchase_order_number)
  where purchase_order_number is not null;

-- ----------------------------------------------------------------------------
-- purchase_order_items
-- ----------------------------------------------------------------------------

create table public.purchase_order_items (
  id                   uuid        primary key default gen_random_uuid(),
  purchase_order_id    uuid        not null,
  organization_id      uuid        not null references public.organizations (id) on delete cascade,
  clinic_id            uuid        not null,
  product_id           uuid        not null,
  -- Snapshot, same reasoning as invoice_items.description -- a later product
  -- rename must never alter a historical PO line.
  description          text        not null check (length(btrim(description)) between 1 and 300),
  quantity_ordered     numeric(14, 3) not null check (quantity_ordered > 0),
  -- Written ONLY by receive_purchase_order_item() (SECURITY DEFINER) --
  -- never a direct client write. See the column-grant revoke below.
  quantity_received    numeric(14, 3) not null default 0 check (quantity_received >= 0),
  unit_cost            numeric(14, 2) not null check (unit_cost >= 0),
  total_cost           numeric(14, 2) generated always as (round(quantity_ordered * unit_cost, 2)) stored,
  created_at           timestamptz not null default now(),

  constraint purchase_order_items_po_fk foreign key (purchase_order_id, organization_id, clinic_id)
    references public.purchase_orders (id, organization_id, clinic_id) on delete cascade,
  constraint purchase_order_items_product_fk foreign key (product_id, organization_id)
    references public.products (id, organization_id),
  constraint purchase_order_items_received_le_ordered check (quantity_received <= quantity_ordered)
);

comment on table public.purchase_order_items is
  'PO line items. quantity_received is derived (receive_purchase_order_item()) -- never client-writable (section 24/25).';

create index purchase_order_items_po_ix on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_org_ix on public.purchase_order_items (organization_id);
create index purchase_order_items_product_ix on public.purchase_order_items (product_id);

-- ----------------------------------------------------------------------------
-- app.recompute_purchase_order_totals() — the one authoritative PO total
-- calculation, mirroring app.recompute_invoice_totals() (migration 0015)
-- exactly. Never duplicated into application code.
-- ----------------------------------------------------------------------------

create or replace function app.recompute_purchase_order_totals(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_subtotal   numeric(14, 2);
  v_tax_rate   numeric(5, 2);
  v_tax_amount numeric(14, 2);
begin
  select coalesce(sum(total_cost), 0) into v_subtotal
    from public.purchase_order_items where purchase_order_id = p_po_id;

  select tax_rate into v_tax_rate from public.purchase_orders where id = p_po_id;

  v_tax_amount := round(v_subtotal * coalesce(v_tax_rate, 0) / 100, 2);

  update public.purchase_orders
     set subtotal   = v_subtotal,
         tax_amount = v_tax_amount,
         total      = v_subtotal + v_tax_amount
   where id = p_po_id;
end;
$fn$;

create or replace function app.purchase_order_items_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  perform app.recompute_purchase_order_totals(coalesce(new.purchase_order_id, old.purchase_order_id));
  return null;
end;
$fn$;

create trigger purchase_order_items_recompute
  after insert or update or delete on public.purchase_order_items
  for each row execute function app.purchase_order_items_recompute_trigger();

create or replace function app.purchase_order_tax_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  perform app.recompute_purchase_order_totals(new.id);
  return null;
end;
$fn$;

-- WHEN guards against recursion, same shape as invoices_discount_tax_recompute.
create trigger purchase_orders_tax_recompute
  after update of tax_rate on public.purchase_orders
  for each row
  when (new.tax_rate is distinct from old.tax_rate)
  execute function app.purchase_order_tax_recompute_trigger();

-- ----------------------------------------------------------------------------
-- app.next_purchase_order_number() / assign_purchase_order_number() —
-- mirrors app.next_invoice_number() (migration 0015) exactly.
-- ----------------------------------------------------------------------------

create or replace function app.next_purchase_order_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  insert into public.document_counters (organization_id, document_type, year, last_number)
  values (p_organization_id, 'purchase_order', v_year, 1)
  on conflict (organization_id, document_type, year)
  do update set last_number = public.document_counters.last_number + 1
  returning last_number into v_next;

  return 'PO-' || v_year || '-' || lpad(v_next::text, 6, '0');
end;
$fn$;

create or replace function app.assign_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.purchase_order_number is null then
    new.purchase_order_number := app.next_purchase_order_number(new.organization_id);
  end if;
  if new.order_date is null then
    new.order_date := current_date;
  end if;
  return new;
end;
$fn$;

create trigger purchase_orders_assign_number
  before update on public.purchase_orders
  for each row
  when (new.status = 'ordered' and old.status is distinct from 'ordered')
  execute function app.assign_purchase_order_number();

-- ----------------------------------------------------------------------------
-- app.check_stock_alert() — crossing-triggered low-stock/out-of-stock
-- notification (section 16). Fires only on the CROSSING (before was above
-- the line, after is at/below it), never on every already-low read, which is
-- what "prevent notification spam" (section 16) actually requires.
-- ----------------------------------------------------------------------------

create or replace function app.notify_inventory_managers(
  p_organization_id uuid,
  p_clinic_id       uuid,
  p_type            text,
  p_title           text,
  p_message         text,
  p_product_id      uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_recipient uuid;
begin
  for v_recipient in
    select distinct ur.user_id
      from public.user_roles ur
      join public.role_permissions rp
        on rp.role_id = ur.role_id and rp.permission_key = 'inventory.manage'
      join public.organization_memberships m
        on m.organization_id = ur.organization_id and m.user_id = ur.user_id and m.status = 'active'
     where ur.organization_id = p_organization_id
       and (ur.clinic_id is null or ur.clinic_id = p_clinic_id)
  loop
    perform public.create_notification(
      p_organization_id, v_recipient, p_type, p_title, p_message, 'product', p_product_id
    );
  end loop;
end;
$fn$;

create or replace function app.check_stock_alert(
  p_organization_id uuid,
  p_clinic_id       uuid,
  p_product_id      uuid,
  p_product_name    text,
  p_quantity_before  numeric,
  p_quantity_after   numeric,
  p_reorder_level    numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if p_quantity_after = 0 and p_quantity_before > 0 then
    perform app.notify_inventory_managers(
      p_organization_id, p_clinic_id, 'inventory_out_of_stock',
      'Out of stock: ' || p_product_name,
      p_product_name || ' is now out of stock.',
      p_product_id
    );
  elsif p_quantity_after <= p_reorder_level and p_quantity_before > p_reorder_level then
    perform app.notify_inventory_managers(
      p_organization_id, p_clinic_id, 'inventory_low_stock',
      'Low stock: ' || p_product_name,
      p_product_name || ' is low on stock (' || p_quantity_after || ' remaining, reorder level ' || p_reorder_level || ').',
      p_product_id
    );
  end if;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- public.receive_stock() — manual stock receiving, independent of a
-- purchase order (section 9). SECURITY DEFINER: quantity_on_hand is off the
-- client column grant (see the RLS section below), so this is the only path
-- that can write it, and it performs its own internal authorization check
-- since DEFINER bypasses RLS/grants -- same pattern as payments'
-- record_refund() (migration 0016).
-- ----------------------------------------------------------------------------

create or replace function public.receive_stock(
  p_clinic_id       uuid,
  p_product_id      uuid,
  p_quantity        numeric,
  p_unit_cost       numeric default null,
  p_batch_number    text default null,
  p_lot_number      text default null,
  p_expiration_date date default null,
  p_notes           text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor      uuid := (select auth.uid());
  v_org        uuid;
  v_product    record;
  v_inv        record;
  v_new_qty    numeric(14, 3);
  v_cost       numeric(14, 2);
  v_movement_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '23514';
  end if;

  select organization_id into v_org from public.clinics where id = p_clinic_id;
  if v_org is null then
    raise exception 'Clinic not found' using errcode = '02000';
  end if;

  if not (p_clinic_id = any (app.permitted_clinics('inventory.manage'))) then
    raise exception 'Not authorized to receive stock for this clinic' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id and organization_id = v_org for update;
  if not found then
    raise exception 'Product not found' using errcode = '02000';
  end if;
  if not v_product.track_inventory then
    raise exception 'This product does not track inventory' using errcode = '23514';
  end if;

  v_cost := coalesce(p_unit_cost, v_product.unit_cost);

  insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
  values (v_org, p_clinic_id, p_product_id, 0, v_product.reorder_level, v_product.reorder_quantity)
  on conflict (organization_id, clinic_id, product_id) do nothing;

  select * into v_inv from public.inventory
   where organization_id = v_org and clinic_id = p_clinic_id and product_id = p_product_id
   for update;

  v_new_qty := v_inv.quantity_on_hand + p_quantity;

  update public.inventory
     set quantity_on_hand = v_new_qty, last_received_at = now()
   where id = v_inv.id;

  insert into public.inventory_movements (
    organization_id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after,
    unit_cost, total_cost, reference_type, batch_number, lot_number, expiration_date, notes, created_by
  ) values (
    v_org, p_clinic_id, p_product_id, 'purchase_received', p_quantity,
    v_inv.quantity_on_hand, v_new_qty, v_cost, round(v_cost * p_quantity, 2),
    'manual', p_batch_number, p_lot_number, p_expiration_date, p_notes, v_actor
  ) returning id into v_movement_id;

  if v_product.track_expiration and p_expiration_date is not null then
    insert into public.inventory_batches (
      organization_id, clinic_id, product_id, batch_number, lot_number, expiration_date, quantity_remaining, unit_cost
    ) values (
      v_org, p_clinic_id, p_product_id, p_batch_number, p_lot_number, p_expiration_date, p_quantity, v_cost
    );
  end if;

  return v_movement_id;
end;
$fn$;

revoke execute on function public.receive_stock(uuid, uuid, numeric, numeric, text, text, date, text) from public, anon;
grant  execute on function public.receive_stock(uuid, uuid, numeric, numeric, text, text, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- public.adjust_inventory() — manual adjustment / damaged / expired /
-- return / correction (section 9). Same DEFINER + internal-check shape.
-- p_batch_id optionally decrements a specific tracked batch alongside the
-- aggregate quantity (section 14).
-- ----------------------------------------------------------------------------

create or replace function public.adjust_inventory(
  p_clinic_id      uuid,
  p_product_id     uuid,
  p_quantity_delta numeric,
  p_movement_type  text,
  p_reason         text,
  p_batch_id       uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor      uuid := (select auth.uid());
  v_org        uuid;
  v_product    record;
  v_inv        record;
  v_new_qty    numeric(14, 3);
  v_movement_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_movement_type not in ('manual_adjustment', 'damaged', 'expired', 'return', 'correction') then
    raise exception 'Invalid movement type for an adjustment' using errcode = '23514';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Enter a non-zero quantity' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = '23514';
  end if;

  select organization_id into v_org from public.clinics where id = p_clinic_id;
  if v_org is null then
    raise exception 'Clinic not found' using errcode = '02000';
  end if;

  if not (p_clinic_id = any (app.permitted_clinics('inventory.manage'))) then
    raise exception 'Not authorized to adjust inventory for this clinic' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id and organization_id = v_org for update;
  if not found then
    raise exception 'Product not found' using errcode = '02000';
  end if;
  if not v_product.track_inventory then
    raise exception 'This product does not track inventory' using errcode = '23514';
  end if;

  insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
  values (v_org, p_clinic_id, p_product_id, 0, v_product.reorder_level, v_product.reorder_quantity)
  on conflict (organization_id, clinic_id, product_id) do nothing;

  select * into v_inv from public.inventory
   where organization_id = v_org and clinic_id = p_clinic_id and product_id = p_product_id
   for update;

  v_new_qty := v_inv.quantity_on_hand + p_quantity_delta;
  -- Never negative (section 10) -- the seam for a future
  -- "allow negative inventory" org setting is this single check, not
  -- scattered validation.
  if v_new_qty < 0 then
    raise exception 'Insufficient stock: % on hand, requested change of %', v_inv.quantity_on_hand, p_quantity_delta
      using errcode = '23514';
  end if;

  update public.inventory
     set quantity_on_hand = v_new_qty,
         last_used_at = case when p_quantity_delta < 0 then now() else last_used_at end
   where id = v_inv.id;

  if p_batch_id is not null then
    update public.inventory_batches
       set quantity_remaining = quantity_remaining - abs(p_quantity_delta)
     where id = p_batch_id
       and clinic_id = p_clinic_id and product_id = p_product_id
       and quantity_remaining >= abs(p_quantity_delta);
    if not found then
      raise exception 'The selected batch does not have enough remaining quantity' using errcode = '23514';
    end if;
  end if;

  insert into public.inventory_movements (
    organization_id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after,
    unit_cost, total_cost, reference_type, notes, created_by
  ) values (
    v_org, p_clinic_id, p_product_id, p_movement_type, p_quantity_delta,
    v_inv.quantity_on_hand, v_new_qty, v_product.unit_cost, round(v_product.unit_cost * abs(p_quantity_delta), 2),
    'manual', p_reason, v_actor
  ) returning id into v_movement_id;

  if p_quantity_delta < 0 then
    perform app.check_stock_alert(
      v_org, p_clinic_id, p_product_id, v_product.name, v_inv.quantity_on_hand, v_new_qty, v_inv.reorder_level
    );
  end if;

  return v_movement_id;
end;
$fn$;

revoke execute on function public.adjust_inventory(uuid, uuid, numeric, text, text, uuid) from public, anon;
grant  execute on function public.adjust_inventory(uuid, uuid, numeric, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- public.transfer_inventory() — atomic clinic-to-clinic transfer (section 9).
-- Locks both inventory rows in a stable (clinic_id-ordered) sequence to avoid
-- a deadlock against a concurrent reverse transfer of the same product.
-- ----------------------------------------------------------------------------

create or replace function public.transfer_inventory(
  p_from_clinic_id uuid,
  p_to_clinic_id   uuid,
  p_product_id     uuid,
  p_quantity       numeric,
  p_notes          text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor        uuid := (select auth.uid());
  v_org          uuid;
  v_org_to       uuid;
  v_product      record;
  v_from         record;
  v_to           record;
  v_new_from_qty numeric(14, 3);
  v_new_to_qty   numeric(14, 3);
  v_group_id     uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_from_clinic_id = p_to_clinic_id then
    raise exception 'Source and destination clinic must be different' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '23514';
  end if;

  select organization_id into v_org    from public.clinics where id = p_from_clinic_id;
  select organization_id into v_org_to from public.clinics where id = p_to_clinic_id;
  if v_org is null or v_org_to is null then
    raise exception 'Clinic not found' using errcode = '02000';
  end if;
  if v_org <> v_org_to then
    raise exception 'Cannot transfer inventory across organizations' using errcode = '42501';
  end if;

  if not (
    p_from_clinic_id = any (app.permitted_clinics('inventory.manage'))
    and p_to_clinic_id = any (app.permitted_clinics('inventory.manage'))
  ) then
    raise exception 'Not authorized to transfer inventory between these clinics' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id and organization_id = v_org for update;
  if not found then
    raise exception 'Product not found' using errcode = '02000';
  end if;
  if not v_product.track_inventory then
    raise exception 'This product does not track inventory' using errcode = '23514';
  end if;

  insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
  values (v_org, p_from_clinic_id, p_product_id, 0, v_product.reorder_level, v_product.reorder_quantity)
  on conflict (organization_id, clinic_id, product_id) do nothing;
  insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
  values (v_org, p_to_clinic_id, p_product_id, 0, v_product.reorder_level, v_product.reorder_quantity)
  on conflict (organization_id, clinic_id, product_id) do nothing;

  if p_from_clinic_id < p_to_clinic_id then
    select * into v_from from public.inventory
     where organization_id = v_org and clinic_id = p_from_clinic_id and product_id = p_product_id for update;
    select * into v_to from public.inventory
     where organization_id = v_org and clinic_id = p_to_clinic_id and product_id = p_product_id for update;
  else
    select * into v_to from public.inventory
     where organization_id = v_org and clinic_id = p_to_clinic_id and product_id = p_product_id for update;
    select * into v_from from public.inventory
     where organization_id = v_org and clinic_id = p_from_clinic_id and product_id = p_product_id for update;
  end if;

  v_new_from_qty := v_from.quantity_on_hand - p_quantity;
  if v_new_from_qty < 0 then
    raise exception 'Insufficient stock at source clinic: % on hand, requested %', v_from.quantity_on_hand, p_quantity
      using errcode = '23514';
  end if;
  v_new_to_qty := v_to.quantity_on_hand + p_quantity;

  update public.inventory set quantity_on_hand = v_new_from_qty, last_used_at = now() where id = v_from.id;
  update public.inventory set quantity_on_hand = v_new_to_qty, last_received_at = now() where id = v_to.id;

  insert into public.inventory_movements (
    organization_id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after,
    unit_cost, total_cost, reference_type, transfer_group_id, notes, created_by
  ) values (
    v_org, p_from_clinic_id, p_product_id, 'transfer_out', -p_quantity, v_from.quantity_on_hand, v_new_from_qty,
    v_product.unit_cost, round(v_product.unit_cost * p_quantity, 2), 'transfer', v_group_id, p_notes, v_actor
  );
  insert into public.inventory_movements (
    organization_id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after,
    unit_cost, total_cost, reference_type, transfer_group_id, notes, created_by
  ) values (
    v_org, p_to_clinic_id, p_product_id, 'transfer_in', p_quantity, v_to.quantity_on_hand, v_new_to_qty,
    v_product.unit_cost, round(v_product.unit_cost * p_quantity, 2), 'transfer', v_group_id, p_notes, v_actor
  );

  perform app.check_stock_alert(
    v_org, p_from_clinic_id, p_product_id, v_product.name, v_from.quantity_on_hand, v_new_from_qty, v_from.reorder_level
  );

  return v_group_id;
end;
$fn$;

revoke execute on function public.transfer_inventory(uuid, uuid, uuid, numeric, text) from public, anon;
grant  execute on function public.transfer_inventory(uuid, uuid, uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- public.consume_inventory_for_appointment() — Service -> Required Supplies
-- -> Inventory Deduction (section 12). Called once, right after an
-- appointment's status is set to 'completed'
-- (app/(app)/appointments/actions.ts). A no-op (returns zero rows) unless
-- the appointment is actually 'completed' -- never fires for cancelled/
-- no-show (section 13). Idempotent via
-- inventory_movements_appointment_product_uk above: a second call for the
-- same appointment raises 23505 on the first product, which the caller
-- catches and ignores, exactly like Phase 4/6's duplicate-event handling.
--
-- Authorization: DEFINER because the person completing an appointment
-- (a receptionist, typically) does not hold inventory.manage -- this is a
-- system-triggered side effect of completion, not a manual inventory
-- operation, so it should not require a separate permission the completer
-- may not have. It still checks that the caller can access this clinic at
-- all (via appointments.update OR inventory.manage), so it can never be used
-- to drain another clinic's stock.
-- ----------------------------------------------------------------------------

create or replace function public.consume_inventory_for_appointment(p_appointment_id uuid)
returns table (
  out_product_id uuid,
  out_product_name text,
  out_quantity_used numeric,
  out_quantity_before numeric,
  out_quantity_after numeric,
  out_reorder_level numeric
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_appt    record;
  v_item    record;
  v_product record;
  v_inv     record;
  v_new_qty numeric(14, 3);
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select id, organization_id, clinic_id, service_id, status into v_appt
    from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'Appointment not found' using errcode = '02000';
  end if;

  if v_appt.status <> 'completed' then
    return;
  end if;

  if not (
    v_appt.clinic_id = any (app.permitted_clinics('appointments.update'))
    or v_appt.clinic_id = any (app.permitted_clinics('inventory.manage'))
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  for v_item in
    select sp.product_id as pid, sp.quantity as qty
      from public.service_products sp
     where sp.service_id = v_appt.service_id
  loop
    select * into v_product from public.products where id = v_item.pid for update;
    if not found or not v_product.track_inventory then
      continue;
    end if;

    insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
    values (v_appt.organization_id, v_appt.clinic_id, v_item.pid, 0, v_product.reorder_level, v_product.reorder_quantity)
    on conflict (organization_id, clinic_id, product_id) do nothing;

    select * into v_inv from public.inventory
     where organization_id = v_appt.organization_id and clinic_id = v_appt.clinic_id and product_id = v_item.pid
     for update;

    v_new_qty := v_inv.quantity_on_hand - v_item.qty;
    if v_new_qty < 0 then
      raise exception 'Insufficient stock of % (have %, need %)', v_product.name, v_inv.quantity_on_hand, v_item.qty
        using errcode = '23514';
    end if;

    update public.inventory set quantity_on_hand = v_new_qty, last_used_at = now() where id = v_inv.id;

    insert into public.inventory_movements (
      organization_id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after,
      unit_cost, total_cost, reference_type, reference_id, created_by
    ) values (
      v_appt.organization_id, v_appt.clinic_id, v_item.pid, 'service_usage', -v_item.qty,
      v_inv.quantity_on_hand, v_new_qty, v_product.unit_cost, round(v_product.unit_cost * v_item.qty, 2),
      'appointment', p_appointment_id, v_actor
    );

    perform app.check_stock_alert(
      v_appt.organization_id, v_appt.clinic_id, v_item.pid, v_product.name,
      v_inv.quantity_on_hand, v_new_qty, v_inv.reorder_level
    );

    out_product_id := v_item.pid;
    out_product_name := v_product.name;
    out_quantity_used := v_item.qty;
    out_quantity_before := v_inv.quantity_on_hand;
    out_quantity_after := v_new_qty;
    out_reorder_level := v_inv.reorder_level;
    return next;
  end loop;

  return;
end;
$fn$;

revoke execute on function public.consume_inventory_for_appointment(uuid) from public, anon;
grant  execute on function public.consume_inventory_for_appointment(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- public.receive_purchase_order_item() — Purchase Order -> Stock Received ->
-- Inventory Increase (section 26), with partial-receiving support
-- (section 25). DEFINER: quantity_received is off the client column grant.
-- ----------------------------------------------------------------------------

create or replace function public.receive_purchase_order_item(
  p_item_id         uuid,
  p_quantity        numeric,
  p_batch_number    text default null,
  p_lot_number      text default null,
  p_expiration_date date default null,
  p_notes           text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor        uuid := (select auth.uid());
  v_item         record;
  v_product      record;
  v_inv          record;
  v_new_received numeric(14, 3);
  v_new_qty      numeric(14, 3);
  v_movement_id  uuid;
  v_open_items   int;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity received must be greater than zero' using errcode = '23514';
  end if;

  select poi.id, poi.purchase_order_id, poi.organization_id, poi.clinic_id, poi.product_id,
         poi.quantity_ordered, poi.quantity_received, poi.unit_cost, po.status as po_status
    into v_item
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
   where poi.id = p_item_id
   for update of poi;

  if not found then
    raise exception 'Purchase order item not found' using errcode = '02000';
  end if;

  if not (v_item.clinic_id = any (app.permitted_clinics('purchase_orders.manage'))) then
    raise exception 'Not authorized to receive this purchase order' using errcode = '42501';
  end if;

  if v_item.po_status not in ('ordered', 'partially_received') then
    raise exception 'This purchase order is not open for receiving (status: %)', v_item.po_status
      using errcode = '23514';
  end if;

  if p_quantity > (v_item.quantity_ordered - v_item.quantity_received) then
    raise exception 'Cannot receive % -- only % remain on this line', p_quantity,
      (v_item.quantity_ordered - v_item.quantity_received) using errcode = '23514';
  end if;

  select * into v_product from public.products where id = v_item.product_id for update;
  if not found or not v_product.track_inventory then
    raise exception 'This product does not track inventory' using errcode = '23514';
  end if;

  insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
  values (v_item.organization_id, v_item.clinic_id, v_item.product_id, 0, v_product.reorder_level, v_product.reorder_quantity)
  on conflict (organization_id, clinic_id, product_id) do nothing;

  select * into v_inv from public.inventory
   where organization_id = v_item.organization_id and clinic_id = v_item.clinic_id and product_id = v_item.product_id
   for update;

  v_new_qty := v_inv.quantity_on_hand + p_quantity;

  update public.inventory
     set quantity_on_hand = v_new_qty, last_received_at = now()
   where id = v_inv.id;

  insert into public.inventory_movements (
    organization_id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after,
    unit_cost, total_cost, reference_type, reference_id, batch_number, lot_number, expiration_date, notes, created_by
  ) values (
    v_item.organization_id, v_item.clinic_id, v_item.product_id, 'purchase_received', p_quantity,
    v_inv.quantity_on_hand, v_new_qty, v_item.unit_cost, round(v_item.unit_cost * p_quantity, 2),
    'purchase_order', v_item.purchase_order_id, p_batch_number, p_lot_number, p_expiration_date, p_notes, v_actor
  ) returning id into v_movement_id;

  if v_product.track_expiration and p_expiration_date is not null then
    insert into public.inventory_batches (
      organization_id, clinic_id, product_id, batch_number, lot_number, expiration_date, quantity_remaining, unit_cost
    ) values (
      v_item.organization_id, v_item.clinic_id, v_item.product_id, p_batch_number, p_lot_number, p_expiration_date,
      p_quantity, v_item.unit_cost
    );
  end if;

  v_new_received := v_item.quantity_received + p_quantity;
  update public.purchase_order_items set quantity_received = v_new_received where id = p_item_id;

  select count(*) into v_open_items
    from public.purchase_order_items
   where purchase_order_id = v_item.purchase_order_id and quantity_received < quantity_ordered;

  update public.purchase_orders
     set status = case when v_open_items = 0 then 'received' else 'partially_received' end
   where id = v_item.purchase_order_id;

  return v_movement_id;
end;
$fn$;

revoke execute on function public.receive_purchase_order_item(uuid, numeric, text, text, date, text) from public, anon;
grant  execute on function public.receive_purchase_order_item(uuid, numeric, text, text, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.suppliers enable row level security;

create policy suppliers_select on public.suppliers
  for select to authenticated
  using (
    organization_id = any (app.permitted_orgs('suppliers.view'))
    or organization_id = any (app.permitted_orgs('suppliers.manage'))
  );

create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check ( organization_id = any (app.permitted_orgs('suppliers.manage')) );

create policy suppliers_update on public.suppliers
  for update to authenticated
  using ( organization_id = any (app.permitted_orgs('suppliers.manage')) )
  with check ( organization_id = any (app.permitted_orgs('suppliers.manage')) );

-- No delete policy -- suppliers are deactivated (status), never removed.
revoke update (organization_id) on public.suppliers from authenticated;

alter table public.products enable row level security;

create policy products_select on public.products
  for select to authenticated
  using (
    organization_id = any (app.permitted_orgs('inventory.view'))
    or organization_id = any (app.permitted_orgs('products.manage'))
  );

create policy products_insert on public.products
  for insert to authenticated
  with check ( organization_id = any (app.permitted_orgs('products.manage')) );

create policy products_update on public.products
  for update to authenticated
  using ( organization_id = any (app.permitted_orgs('products.manage')) )
  with check ( organization_id = any (app.permitted_orgs('products.manage')) );

revoke update (organization_id) on public.products from authenticated;

alter table public.inventory enable row level security;

create policy inventory_select on public.inventory
  for select to authenticated
  using ( clinic_id = any (app.permitted_clinics('inventory.view')) );

-- Only a threshold edit goes through a plain client UPDATE -- quantity_on_hand
-- and the last_*_at timestamps are structurally unwritable here (see the
-- grant below), so every quantity change must go through one of the
-- SECURITY DEFINER RPCs above. No INSERT/DELETE policy: rows are created
-- only by those RPCs (which bypass RLS via ownership).
create policy inventory_update on public.inventory
  for update to authenticated
  using ( clinic_id = any (app.permitted_clinics('inventory.manage')) )
  with check ( clinic_id = any (app.permitted_clinics('inventory.manage')) );

revoke update on public.inventory from authenticated;
grant update (reorder_level, reorder_quantity) on public.inventory to authenticated;

alter table public.inventory_batches enable row level security;

create policy inventory_batches_select on public.inventory_batches
  for select to authenticated
  using ( clinic_id = any (app.permitted_clinics('inventory.view')) );

-- No insert/update/delete policy -- batches are created and decremented only
-- by the SECURITY DEFINER stock RPCs.

alter table public.inventory_movements enable row level security;

create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using ( clinic_id = any (app.permitted_clinics('inventory.view')) );

-- No insert/update/delete policy at all for authenticated -- the ledger is
-- written only by the SECURITY DEFINER stock RPCs, and is never editable
-- once written (section 8).

alter table public.service_products enable row level security;

create policy service_products_select on public.service_products
  for select to authenticated
  using (
    exists (
      select 1 from public.services s
      where s.id = service_products.service_id
        and s.clinic_id = any (app.permitted_clinics('services.view'))
    )
  );

create policy service_products_insert on public.service_products
  for insert to authenticated
  with check (
    exists (
      select 1 from public.services s
      where s.id = service_products.service_id
        and s.clinic_id = any (app.permitted_clinics('services.manage'))
    )
  );

create policy service_products_update on public.service_products
  for update to authenticated
  using (
    exists (
      select 1 from public.services s
      where s.id = service_products.service_id
        and s.clinic_id = any (app.permitted_clinics('services.manage'))
    )
  )
  with check (
    exists (
      select 1 from public.services s
      where s.id = service_products.service_id
        and s.clinic_id = any (app.permitted_clinics('services.manage'))
    )
  );

create policy service_products_delete on public.service_products
  for delete to authenticated
  using (
    exists (
      select 1 from public.services s
      where s.id = service_products.service_id
        and s.clinic_id = any (app.permitted_clinics('services.manage'))
    )
  );

revoke update (service_id, organization_id) on public.service_products from authenticated;
grant update (product_id, quantity, notes) on public.service_products to authenticated;

alter table public.purchase_orders enable row level security;

create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using (
    clinic_id = any (app.permitted_clinics('purchase_orders.view'))
    or clinic_id = any (app.permitted_clinics('purchase_orders.manage'))
  );

create policy purchase_orders_insert on public.purchase_orders
  for insert to authenticated
  with check ( clinic_id = any (app.permitted_clinics('purchase_orders.manage')) );

create policy purchase_orders_update on public.purchase_orders
  for update to authenticated
  using ( clinic_id = any (app.permitted_clinics('purchase_orders.manage')) )
  with check ( clinic_id = any (app.permitted_clinics('purchase_orders.manage')) );

-- No delete policy -- a PO is cancelled (status), never removed.
revoke update on public.purchase_orders from authenticated;
grant update (status, supplier_id, order_date, expected_date, notes, tax_rate) on public.purchase_orders to authenticated;

alter table public.purchase_order_items enable row level security;

create policy purchase_order_items_select on public.purchase_order_items
  for select to authenticated
  using ( clinic_id = any (app.permitted_clinics('purchase_orders.view')) or clinic_id = any (app.permitted_clinics('purchase_orders.manage')) );

-- Lines are only mutable while their PO is still a draft -- once ordered,
-- editing a line here would silently change quantities/costs already sent
-- to a supplier. quantity_received is the only field that changes after
-- that point, and only via receive_purchase_order_item().
create policy purchase_order_items_insert on public.purchase_order_items
  for insert to authenticated
  with check (
    clinic_id = any (app.permitted_clinics('purchase_orders.manage'))
    and exists (
      select 1 from public.purchase_orders po
      where po.id = purchase_order_items.purchase_order_id and po.status = 'draft'
    )
  );

create policy purchase_order_items_update on public.purchase_order_items
  for update to authenticated
  using (
    clinic_id = any (app.permitted_clinics('purchase_orders.manage'))
    and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.status = 'draft')
  )
  with check (
    clinic_id = any (app.permitted_clinics('purchase_orders.manage'))
    and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.status = 'draft')
  );

create policy purchase_order_items_delete on public.purchase_order_items
  for delete to authenticated
  using (
    clinic_id = any (app.permitted_clinics('purchase_orders.manage'))
    and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.status = 'draft')
  );

revoke update on public.purchase_order_items from authenticated;
grant update (description, quantity_ordered, unit_cost) on public.purchase_order_items to authenticated;
