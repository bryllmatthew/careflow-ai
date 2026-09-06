-- ============================================================================
-- Inventory negative-security + ledger-integrity suite (Phase 7)
--
-- Covers: receive_stock/adjust_inventory/transfer_inventory validation and
-- authorization, the append-only movement ledger's before/after snapshots,
-- negative-stock prevention, transfer atomicity, service_products ->
-- consume_inventory_for_appointment (including idempotency and insufficient
-- stock), purchase order partial/over-receiving, low-stock/out-of-stock
-- crossing notifications, and org/clinic isolation.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_clinic_a1 uuid; v_clinic_a2 uuid; v_clinic_b uuid;
  v_inv_mgr uuid; v_practitioner uuid; v_clinic_a1_mgr uuid; v_owner_b uuid;
  v_role_inventory_manager uuid; v_role_practitioner uuid; v_role_clinic_manager uuid; v_role_owner uuid;
  v_supplier_a uuid;
  v_product_a uuid; v_product_tracked uuid; v_product_no_track uuid;
  v_service_a uuid; v_service_shortage uuid;
  v_patient_a uuid;
  v_appt_a uuid; v_appt_shortage uuid;
  v_po_a uuid; v_po_item_a uuid;
begin
  select id into v_role_inventory_manager from public.roles where key = 'inventory_manager' and organization_id is null;
  select id into v_role_practitioner      from public.roles where key = 'practitioner'      and organization_id is null;
  select id into v_role_clinic_manager    from public.roles where key = 'clinic_manager'    and organization_id is null;
  select id into v_role_owner             from public.roles where key = 'owner'             and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-mgr@fixture.test') returning id into v_inv_mgr;
  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-practitioner@fixture.test') returning id into v_practitioner;
  -- Scoped to clinic A1 only -- the clinic-isolation case.
  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-a1-mgr@fixture.test') returning id into v_clinic_a1_mgr;
  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-owner-b@fixture.test') returning id into v_owner_b;

  insert into public.organizations (name) values ('Inventory Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Inventory Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A1') returning id into v_clinic_a1;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A2') returning id into v_clinic_a2;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_inv_mgr, 'active'),
    (v_org_a, v_practitioner, 'active'),
    (v_org_a, v_clinic_a1_mgr, 'active'),
    (v_org_b, v_owner_b, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_inv_mgr, v_role_inventory_manager, v_org_a, null),
    (v_practitioner, v_role_practitioner, v_org_a, null),
    (v_clinic_a1_mgr, v_role_clinic_manager, v_org_a, v_clinic_a1),
    (v_owner_b, v_role_owner, v_org_b, null);

  insert into public.suppliers (organization_id, name) values (v_org_a, 'Fixture Supplier') returning id into v_supplier_a;

  insert into public.products (organization_id, name, sku, track_inventory, track_expiration, unit_cost, reorder_level, reorder_quantity)
    values (v_org_a, 'Nitrile Gloves (Box)', 'GLV-001', true, false, 5.00, 20, 50)
    returning id into v_product_a;
  insert into public.products (organization_id, name, sku, track_inventory, track_expiration, unit_cost)
    values (v_org_a, 'Local Anesthetic', 'ANE-001', true, true, 12.00)
    returning id into v_product_tracked;
  insert into public.products (organization_id, name, sku, track_inventory)
    values (v_org_a, 'Non-stock service line', 'SVC-001', false)
    returning id into v_product_no_track;

  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_a, v_clinic_a1, 'Ada', 'Fixture') returning id into v_patient_a;

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a1, 'Cleaning', 30, 500) returning id into v_service_a;
  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a1, 'Bulk procedure', 60, 2000) returning id into v_service_shortage;

  -- Cleaning requires 2 boxes of gloves per appointment.
  insert into public.service_products (organization_id, service_id, product_id, quantity)
    values (v_org_a, v_service_a, v_product_a, 2);
  -- Bulk procedure deliberately requires more than will ever be in stock,
  -- for the insufficient-stock test.
  insert into public.service_products (organization_id, service_id, product_id, quantity)
    values (v_org_a, v_service_shortage, v_product_a, 100000);

  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
    values (v_org_a, v_clinic_a1, v_patient_a, v_service_a, v_inv_mgr, '2026-02-01 09:00+00', '2026-02-01 09:30+00', 'confirmed')
    returning id into v_appt_a;
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
    values (v_org_a, v_clinic_a1, v_patient_a, v_service_shortage, v_inv_mgr, '2026-02-02 09:00+00', '2026-02-02 10:00+00', 'completed')
    returning id into v_appt_shortage;

  insert into public.purchase_orders (organization_id, clinic_id, supplier_id, status)
    values (v_org_a, v_clinic_a1, v_supplier_a, 'ordered') returning id into v_po_a;
  insert into public.purchase_order_items (purchase_order_id, organization_id, clinic_id, product_id, description, quantity_ordered, unit_cost)
    values (v_po_a, v_org_a, v_clinic_a1, v_product_a, 'Nitrile Gloves (Box)', 100, 5.00)
    returning id into v_po_item_a;

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a1', v_clinic_a1::text, false);
  perform set_config('fx.clinic_a2', v_clinic_a2::text, false);
  perform set_config('fx.clinic_b', v_clinic_b::text, false);
  perform set_config('fx.inv_mgr', v_inv_mgr::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
  perform set_config('fx.clinic_a1_mgr', v_clinic_a1_mgr::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
  perform set_config('fx.supplier_a', v_supplier_a::text, false);
  perform set_config('fx.product_a', v_product_a::text, false);
  perform set_config('fx.product_tracked', v_product_tracked::text, false);
  perform set_config('fx.product_no_track', v_product_no_track::text, false);
  perform set_config('fx.appt_a', v_appt_a::text, false);
  perform set_config('fx.appt_shortage', v_appt_shortage::text, false);
  perform set_config('fx.po_a', v_po_a::text, false);
  perform set_config('fx.po_item_a', v_po_item_a::text, false);
end $$;

set local role authenticated;

-- ----------------------------------------------------------------------------
-- receive_stock(): permission, validation, ledger creation.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');
select throws_ok(
  format('select public.receive_stock(%L::uuid, %L::uuid, 50, 5.00, null, null, null, null)',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '42501', null,
  'a practitioner (no inventory.manage) cannot receive stock'
);

select pg_temp.act_as('inv_mgr');

select throws_ok(
  format('select public.receive_stock(%L::uuid, %L::uuid, 0, 5.00, null, null, null, null)',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '23514', null,
  'zero quantity is rejected'
);

select throws_ok(
  format('select public.receive_stock(%L::uuid, %L::uuid, 10, 5.00, null, null, null, null)',
         current_setting('fx.clinic_a1'), current_setting('fx.product_no_track')),
  '23514', null,
  'receiving a product with track_inventory=false is rejected'
);

select public.receive_stock(current_setting('fx.clinic_a1')::uuid, current_setting('fx.product_a')::uuid, 50, 5.00, null, null, null, 'Initial stock') as movement1_id \gset

select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  50.000,
  'receiving 50 creates the inventory row with quantity_on_hand = 50'
);
select is(
  (select (quantity_before, quantity_after, movement_type)::text from public.inventory_movements where id = :'movement1_id'::uuid),
  '(0.000,50.000,purchase_received)',
  'the movement records a 0 -> 50 purchase_received with correct before/after'
);

-- ----------------------------------------------------------------------------
-- adjust_inventory(): permission, validation, negative-stock prevention.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');
select throws_ok(
  format('select public.adjust_inventory(%L::uuid, %L::uuid, -5, ''damaged'', ''broke a box'')',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '42501', null,
  'a practitioner cannot adjust inventory'
);

select pg_temp.act_as('inv_mgr');

select throws_ok(
  format('select public.adjust_inventory(%L::uuid, %L::uuid, 0, ''damaged'', ''x'')',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '23514', null,
  'a zero-quantity adjustment is rejected'
);
select throws_ok(
  format('select public.adjust_inventory(%L::uuid, %L::uuid, -5, ''damaged'', '''')',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '23514', null,
  'an adjustment with no reason is rejected'
);
select throws_ok(
  format('select public.adjust_inventory(%L::uuid, %L::uuid, -9999, ''damaged'', ''too many'')',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '23514', null,
  'an adjustment that would drive stock negative is rejected'
);

select public.adjust_inventory(current_setting('fx.clinic_a1')::uuid, current_setting('fx.product_a')::uuid, -10, 'damaged', 'Dropped box') as movement2_id \gset

select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  40.000,
  '-10 damaged adjustment brings stock from 50 to 40'
);

-- ----------------------------------------------------------------------------
-- transfer_inventory(): validation, atomicity, both linked movements.
-- ----------------------------------------------------------------------------

select throws_ok(
  format('select public.transfer_inventory(%L::uuid, %L::uuid, %L::uuid, 5, null)',
         current_setting('fx.clinic_a1'), current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '23514', null,
  'transferring to the same clinic is rejected'
);
select throws_ok(
  format('select public.transfer_inventory(%L::uuid, %L::uuid, %L::uuid, 9999, null)',
         current_setting('fx.clinic_a1'), current_setting('fx.clinic_a2'), current_setting('fx.product_a')),
  '23514', null,
  'transferring more than available at the source is rejected'
);

select public.transfer_inventory(current_setting('fx.clinic_a1')::uuid, current_setting('fx.clinic_a2')::uuid, current_setting('fx.product_a')::uuid, 15, 'Rebalance') as transfer_group_id \gset
select set_config('fx.transfer_group', :'transfer_group_id', false);

select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  25.000,
  'source clinic drops from 40 to 25 after transferring 15'
);
select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a2')::uuid and product_id = current_setting('fx.product_a')::uuid),
  15.000,
  'destination clinic increases from 0 to 15'
);
select is(
  (select count(*)::int from public.inventory_movements where transfer_group_id = current_setting('fx.transfer_group')::uuid),
  2,
  'exactly two movements share the transfer_group_id'
);
select is(
  (select array_agg(movement_type order by movement_type)::text from public.inventory_movements where transfer_group_id = current_setting('fx.transfer_group')::uuid),
  '{transfer_in,transfer_out}',
  'the two linked movements are one transfer_in and one transfer_out'
);

select pg_temp.act_as('clinic_a1_mgr');
select throws_ok(
  format('select public.transfer_inventory(%L::uuid, %L::uuid, %L::uuid, 1, null)',
         current_setting('fx.clinic_a1'), current_setting('fx.clinic_b'), current_setting('fx.product_a')),
  '42501', null,
  'a clinic-A1-scoped manager cannot transfer into a clinic they do not have access to'
);

-- ----------------------------------------------------------------------------
-- Clinic isolation: a clinic-A1-scoped manager cannot touch clinic A2's stock.
-- ----------------------------------------------------------------------------

select throws_ok(
  format('select public.adjust_inventory(%L::uuid, %L::uuid, -1, ''manual_adjustment'', ''test'')',
         current_setting('fx.clinic_a2'), current_setting('fx.product_a')),
  '42501', null,
  'a clinic-A1-scoped manager cannot adjust clinic A2''s inventory'
);
select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  25.000,
  'a clinic-A1-scoped manager CAN still adjust their own clinic (sanity check for the isolation test above)'
);

-- ----------------------------------------------------------------------------
-- Low-stock / out-of-stock crossing notifications (section 16). Bring A1's
-- 25 down to 15 (crosses the reorder_level of 20) in one adjustment.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('inv_mgr');
select public.adjust_inventory(current_setting('fx.clinic_a1')::uuid, current_setting('fx.product_a')::uuid, -10, 'manual_adjustment', 'Stock count correction') as movement3_id \gset

select is(
  (select count(*)::int from public.notifications where type = 'inventory_low_stock' and user_id = current_setting('fx.inv_mgr')::uuid),
  1,
  'crossing the reorder_level fires exactly one inventory_low_stock notification'
);

-- A second, smaller decrease that stays below the threshold must NOT fire a
-- second alert -- "prevent notification spam" (section 16).
select public.adjust_inventory(current_setting('fx.clinic_a1')::uuid, current_setting('fx.product_a')::uuid, -1, 'manual_adjustment', 'small correction') as movement4_id \gset
select is(
  (select count(*)::int from public.notifications where type = 'inventory_low_stock' and user_id = current_setting('fx.inv_mgr')::uuid),
  1,
  'staying below (not crossing) the threshold again does not fire a duplicate alert'
);

-- Drive it to zero -- fires out_of_stock, not a second low_stock.
select public.adjust_inventory(current_setting('fx.clinic_a1')::uuid, current_setting('fx.product_a')::uuid, -14, 'manual_adjustment', 'clear remaining') as movement5_id \gset
select is(
  (select count(*)::int from public.notifications where type = 'inventory_out_of_stock' and user_id = current_setting('fx.inv_mgr')::uuid),
  1,
  'crossing to zero fires exactly one inventory_out_of_stock notification'
);

-- Restock A1 back up for the appointment-consumption tests below.
select public.receive_stock(current_setting('fx.clinic_a1')::uuid, current_setting('fx.product_a')::uuid, 30, 5.00, null, null, null, 'Restock') as movement6_id \gset

-- ----------------------------------------------------------------------------
-- Service -> supply consumption on appointment completion (sections 12/13/35).
-- ----------------------------------------------------------------------------

-- v_appt_a is still 'confirmed' -- consuming for a non-completed appointment
-- is a safe no-op (zero rows), never an error and never a deduction.
select is(
  (select count(*)::int from public.consume_inventory_for_appointment(current_setting('fx.appt_a')::uuid)),
  0,
  'consuming inventory for a not-yet-completed appointment is a no-op (returns zero rows)'
);
select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  30.000,
  'stock is unchanged after the no-op consume call'
);

-- inv_mgr holds no appointments.* permission at all (inventory_manager role,
-- migration 0002) -- completing the appointment here is fixture setup, not
-- the thing under test, so it's done with RLS bypassed rather than as a
-- role this suite doesn't otherwise need.
reset role;
update public.appointments set status = 'completed' where id = current_setting('fx.appt_a')::uuid;
set local role authenticated;
select pg_temp.act_as('inv_mgr');

select is(
  (select out_quantity_used from public.consume_inventory_for_appointment(current_setting('fx.appt_a')::uuid) limit 1),
  2.000,
  'completing the appointment consumes the 2 units required by its service, and the RPC reports it'
);
select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  28.000,
  'stock drops from 30 to 28 (2 boxes consumed)'
);
select is(
  (select count(*)::int from public.inventory_movements where reference_type = 'appointment' and reference_id = current_setting('fx.appt_a')::uuid),
  1,
  'exactly one service_usage movement is recorded for this appointment'
);

-- Idempotency: calling it again for the SAME already-processed appointment
-- must not deduct a second time.
select throws_ok(
  format('select * from public.consume_inventory_for_appointment(%L::uuid)', current_setting('fx.appt_a')),
  '23505', null,
  'consuming inventory twice for the same appointment is rejected by the idempotency unique index, not double-deducted'
);
select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  28.000,
  'stock is still 28 after the rejected duplicate consume attempt -- no double deduction'
);

-- Insufficient stock: v_appt_shortage's service requires 100000 units.
select throws_ok(
  format('select * from public.consume_inventory_for_appointment(%L::uuid)', current_setting('fx.appt_shortage')),
  '23514', null,
  'consuming inventory for a service that needs more than is in stock is rejected'
);
select is(
  (select quantity_on_hand from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid and product_id = current_setting('fx.product_a')::uuid),
  28.000,
  'a rejected insufficient-stock consumption leaves stock untouched'
);

-- ----------------------------------------------------------------------------
-- Purchase orders: partial receiving, over-receiving prevention (sections 24/25).
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');
select throws_ok(
  format('select public.receive_purchase_order_item(%L::uuid, 10, null, null, null, null)', current_setting('fx.po_item_a')),
  '42501', null,
  'a practitioner (no purchase_orders.manage) cannot receive a purchase order'
);

select pg_temp.act_as('inv_mgr');

select throws_ok(
  format('select public.receive_purchase_order_item(%L::uuid, 150, null, null, null, null)', current_setting('fx.po_item_a')),
  '23514', null,
  'receiving more than the ordered quantity (100) is rejected'
);

select public.receive_purchase_order_item(current_setting('fx.po_item_a')::uuid, 60, 'BATCH-1', null, null, 'First delivery') as po_movement1_id \gset

select is(
  (select status from public.purchase_orders where id = current_setting('fx.po_a')::uuid),
  'partially_received',
  'receiving 60 of 100 marks the purchase order partially_received'
);
select is(
  (select quantity_received from public.purchase_order_items where id = current_setting('fx.po_item_a')::uuid),
  60.000,
  'quantity_received on the line reflects the 60 actually received'
);

select throws_ok(
  format('select public.receive_purchase_order_item(%L::uuid, 50, null, null, null, null)', current_setting('fx.po_item_a')),
  '23514', null,
  'receiving 50 more (only 40 remain on the line) is rejected as over-receiving'
);

select public.receive_purchase_order_item(current_setting('fx.po_item_a')::uuid, 40, null, null, null, 'Remaining delivery') as po_movement2_id \gset

select is(
  (select status from public.purchase_orders where id = current_setting('fx.po_a')::uuid),
  'received',
  'receiving the remaining 40 (100/100 total) marks the purchase order fully received'
);

select throws_ok(
  format('select public.receive_purchase_order_item(%L::uuid, 1, null, null, null, null)', current_setting('fx.po_item_a')),
  '23514', null,
  'a fully-received purchase order line cannot accept a further receipt'
);

-- quantity_received is not directly client-writable, even by an authorized user.
select throws_ok(
  format('update public.purchase_order_items set quantity_received = 0 where id = %L::uuid', current_setting('fx.po_item_a')),
  '42501', null,
  'quantity_received cannot be set directly by a client update'
);

-- ----------------------------------------------------------------------------
-- Product/SKU isolation and uniqueness.
-- ----------------------------------------------------------------------------

select throws_ok(
  format($sql$insert into public.products (organization_id, name, sku, track_inventory) values (%L::uuid, 'Dup', 'GLV-001', true)$sql$,
         current_setting('fx.org_a')),
  '23505', null,
  'a duplicate SKU within the same organization is rejected'
);

-- ----------------------------------------------------------------------------
-- Org isolation: an org B user cannot see any of org A's inventory data.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_b');
select is(
  (select count(*)::int from public.products where id = current_setting('fx.product_a')::uuid),
  0,
  'an org B user cannot see org A''s product'
);
select is(
  (select count(*)::int from public.inventory where clinic_id = current_setting('fx.clinic_a1')::uuid),
  0,
  'an org B user cannot see org A''s inventory rows'
);
select is(
  (select count(*)::int from public.inventory_movements where clinic_id = current_setting('fx.clinic_a1')::uuid),
  0,
  'an org B user cannot see org A''s inventory movements'
);
select is(
  (select count(*)::int from public.purchase_orders where id = current_setting('fx.po_a')::uuid),
  0,
  'an org B user cannot see org A''s purchase order'
);
select throws_ok(
  format('select public.adjust_inventory(%L::uuid, %L::uuid, -1, ''manual_adjustment'', ''malicious'')',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '42501', null,
  'an org B user cannot adjust org A''s inventory'
);

-- Composite FK: a product/inventory row whose clinic belongs to a different
-- organization than the one declared is structurally rejected.
reset role;
select throws_ok(
  format($sql$insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand) values (%L::uuid, %L::uuid, %L::uuid, 5)$sql$,
         current_setting('fx.org_b'), current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '23503', null,
  'an inventory row whose clinic belongs to a different org than declared is rejected by the composite foreign key'
);

set local role authenticated;
select pg_temp.act_as('inv_mgr');

-- quantity_on_hand is not directly client-writable even by inventory.manage --
-- only the stock RPCs may write it.
select throws_ok(
  format('update public.inventory set quantity_on_hand = 999 where clinic_id = %L::uuid and product_id = %L::uuid',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  '42501', null,
  'quantity_on_hand cannot be set directly by a client update, even by an inventory.manage holder'
);

-- reorder_level/reorder_quantity ARE directly editable -- plain threshold
-- configuration, not a stock movement.
select lives_ok(
  format('update public.inventory set reorder_level = 25 where clinic_id = %L::uuid and product_id = %L::uuid',
         current_setting('fx.clinic_a1'), current_setting('fx.product_a')),
  'reorder_level can be updated directly by an inventory.manage holder'
);

select * from finish();
rollback;
