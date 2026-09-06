import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { stockStatus, type StockStatus } from "@/lib/validation/inventory.schema";

export const INVENTORY_PAGE_SIZE = 20;

export type InventoryRow = {
  id: string;
  clinicId: string;
  clinicName: string;
  productId: string;
  productName: string;
  sku: string | null;
  category: string | null;
  unitOfMeasure: string;
  quantityOnHand: string;
  reorderLevel: string;
  reorderQuantity: string;
  status: StockStatus;
  trackExpiration: boolean;
  earliestExpiration: string | null;
  lastReceivedAt: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
};

type RawInventory = {
  id: string;
  clinic_id: string;
  product_id: string;
  quantity_on_hand: number;
  reorder_level: number;
  reorder_quantity: number;
  last_received_at: string | null;
  last_used_at: string | null;
  updated_at: string;
  clinics: { name: string } | null;
  products: {
    name: string;
    sku: string | null;
    category: string | null;
    unit_of_measure: string;
    track_expiration: boolean;
  } | null;
};

const INVENTORY_SELECT =
  "id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity, last_received_at, last_used_at, updated_at, " +
  "clinics(name), products!inner(name, sku, category, unit_of_measure, track_expiration)";

async function attachEarliestExpiration(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  rows: { clinicId: string; productId: string; trackExpiration: boolean }[],
): Promise<Map<string, string>> {
  const tracked = rows.filter((r) => r.trackExpiration);
  if (tracked.length === 0) return new Map();

  const clinicIds = Array.from(new Set(tracked.map((r) => r.clinicId)));
  const productIds = Array.from(new Set(tracked.map((r) => r.productId)));

  const { data } = await supabase
    .from("inventory_batches")
    .select("clinic_id, product_id, expiration_date")
    .in("clinic_id", clinicIds)
    .in("product_id", productIds)
    .gt("quantity_remaining", 0)
    .not("expiration_date", "is", null)
    .order("expiration_date");

  const map = new Map<string, string>();
  for (const b of data ?? []) {
    const key = `${b.clinic_id}:${b.product_id}`;
    if (!map.has(key) && b.expiration_date) map.set(key, b.expiration_date);
  }
  return map;
}

function mapInventory(r: RawInventory): Omit<InventoryRow, "earliestExpiration"> {
  const quantityOnHand = r.quantity_on_hand;
  const reorderLevel = r.reorder_level;
  return {
    id: r.id,
    clinicId: r.clinic_id,
    clinicName: r.clinics?.name ?? "Unknown clinic",
    productId: r.product_id,
    productName: r.products?.name ?? "Unknown product",
    sku: r.products?.sku ?? null,
    category: r.products?.category ?? null,
    unitOfMeasure: r.products?.unit_of_measure ?? "unit",
    quantityOnHand: quantityOnHand.toFixed(3),
    reorderLevel: reorderLevel.toFixed(3),
    reorderQuantity: r.reorder_quantity.toFixed(3),
    status: stockStatus(quantityOnHand, reorderLevel),
    trackExpiration: r.products?.track_expiration ?? false,
    lastReceivedAt: r.last_received_at,
    lastUsedAt: r.last_used_at,
    updatedAt: r.updated_at,
  };
}

export type InventoryListFilters = {
  q?: string;
  clinicId?: string;
  category?: string;
  status?: StockStatus | "all";
  expiration?: "expiring_soon" | "expired" | "all";
  page?: number;
  /** Report views (app/(app)/reports/inventory) need a full snapshot, not one paginated page. */
  pageSize?: number;
};

export async function listInventory(
  organizationId: string,
  filters: InventoryListFilters,
): Promise<{ rows: InventoryRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const pageSize = filters.pageSize ?? INVENTORY_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("inventory")
    .select(INVENTORY_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.category) query = query.eq("products.category", filters.category);
  if (filters.status === "out_of_stock") query = query.lte("quantity_on_hand", 0);
  else if (filters.status === "low_stock")
    query = query.eq("is_low_stock", true).gt("quantity_on_hand", 0);
  if (filters.q && filters.q.trim()) {
    query = query.or(`name.ilike.%${filters.q.trim()}%,sku.ilike.%${filters.q.trim()}%`, {
      referencedTable: "products",
    });
  }

  const { data, count } = await query.order("updated_at", { ascending: false }).range(from, to);
  const mapped = (data ?? []).map((r) => mapInventory(r as unknown as RawInventory));
  const expirationMap = await attachEarliestExpiration(supabase, mapped);

  let rows: InventoryRow[] = mapped.map((r) => ({
    ...r,
    earliestExpiration: expirationMap.get(`${r.clinicId}:${r.productId}`) ?? null,
  }));

  if (filters.expiration === "expired") {
    rows = rows.filter((r) => r.earliestExpiration && new Date(r.earliestExpiration) < new Date());
  } else if (filters.expiration === "expiring_soon") {
    const cutoff = Date.now() + 30 * 86_400_000;
    rows = rows.filter(
      (r) =>
        r.earliestExpiration &&
        new Date(r.earliestExpiration) >= new Date() &&
        new Date(r.earliestExpiration).getTime() <= cutoff,
    );
  }

  return { rows, total: count ?? 0 };
}

export type MovementRow = {
  id: string;
  clinicId: string;
  clinicName: string;
  productId: string;
  productName: string;
  movementType: string;
  quantity: string;
  quantityBefore: string;
  quantityAfter: string;
  unitCost: string | null;
  totalCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  batchNumber: string | null;
  lotNumber: string | null;
  expirationDate: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
};

const MOVEMENT_SELECT =
  "id, clinic_id, product_id, movement_type, quantity, quantity_before, quantity_after, unit_cost, total_cost, " +
  "reference_type, reference_id, batch_number, lot_number, expiration_date, notes, created_at, " +
  "clinics(name), products(name), profiles:created_by(full_name)";

type RawMovement = {
  id: string;
  clinic_id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: number | null;
  total_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  batch_number: string | null;
  lot_number: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
  clinics: { name: string } | null;
  products: { name: string } | null;
  profiles: { full_name: string | null } | null;
};

function mapMovement(m: RawMovement): MovementRow {
  return {
    id: m.id,
    clinicId: m.clinic_id,
    clinicName: m.clinics?.name ?? "Unknown clinic",
    productId: m.product_id,
    productName: m.products?.name ?? "Unknown product",
    movementType: m.movement_type,
    quantity: m.quantity.toFixed(3),
    quantityBefore: m.quantity_before.toFixed(3),
    quantityAfter: m.quantity_after.toFixed(3),
    unitCost: m.unit_cost === null ? null : m.unit_cost.toFixed(2),
    totalCost: m.total_cost === null ? null : m.total_cost.toFixed(2),
    referenceType: m.reference_type,
    referenceId: m.reference_id,
    batchNumber: m.batch_number,
    lotNumber: m.lot_number,
    expirationDate: m.expiration_date,
    notes: m.notes,
    createdByName: m.profiles?.full_name ?? null,
    createdAt: m.created_at,
  };
}

export async function listProductMovements(
  productId: string,
  clinicId?: string,
): Promise<MovementRow[]> {
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("inventory_movements")
    .select(MOVEMENT_SELECT)
    .eq("product_id", productId);
  if (clinicId) query = query.eq("clinic_id", clinicId);
  const { data } = await query.order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map((m) => mapMovement(m as unknown as RawMovement));
}

export type MovementListFilters = {
  clinicId?: string;
  productId?: string;
  movementType?: string;
  /** Inclusive ISO instant lower/upper bounds -- Phase 8's inventory usage report (section 22 "by date range"). */
  startUtc?: string;
  endUtc?: string;
  page?: number;
  pageSize?: number;
};

export const MOVEMENTS_PAGE_SIZE = 30;

export async function listMovements(
  organizationId: string,
  filters: MovementListFilters,
): Promise<{ rows: MovementRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const pageSize = filters.pageSize ?? MOVEMENTS_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("inventory_movements")
    .select(MOVEMENT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);
  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.movementType) query = query.eq("movement_type", filters.movementType);
  if (filters.startUtc) query = query.gte("created_at", filters.startUtc);
  if (filters.endUtc) query = query.lt("created_at", filters.endUtc);

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  return {
    rows: (data ?? []).map((m) => mapMovement(m as unknown as RawMovement)),
    total: count ?? 0,
  };
}

export type InventoryBatchRow = {
  id: string;
  clinicId: string;
  clinicName: string;
  batchNumber: string | null;
  lotNumber: string | null;
  expirationDate: string | null;
  quantityRemaining: string;
  unitCost: string | null;
  receivedAt: string;
};

export async function listProductBatches(productId: string): Promise<InventoryBatchRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("inventory_batches")
    .select(
      "id, clinic_id, batch_number, lot_number, expiration_date, quantity_remaining, unit_cost, received_at, clinics(name)",
    )
    .eq("product_id", productId)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    clinicId: b.clinic_id,
    clinicName: (b.clinics as { name: string } | null)?.name ?? "Unknown clinic",
    batchNumber: b.batch_number,
    lotNumber: b.lot_number,
    expirationDate: b.expiration_date,
    quantityRemaining: b.quantity_remaining.toFixed(3),
    unitCost: b.unit_cost === null ? null : b.unit_cost.toFixed(2),
    receivedAt: b.received_at,
  }));
}

/** For inventory-specific batch selection in the adjust-stock dialog (damaged/expired against a specific batch). */
export async function listClinicProductBatches(
  clinicId: string,
  productId: string,
): Promise<InventoryBatchRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("inventory_batches")
    .select(
      "id, clinic_id, batch_number, lot_number, expiration_date, quantity_remaining, unit_cost, received_at, clinics(name)",
    )
    .eq("clinic_id", clinicId)
    .eq("product_id", productId)
    .gt("quantity_remaining", 0)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    clinicId: b.clinic_id,
    clinicName: (b.clinics as { name: string } | null)?.name ?? "Unknown clinic",
    batchNumber: b.batch_number,
    lotNumber: b.lot_number,
    expirationDate: b.expiration_date,
    quantityRemaining: b.quantity_remaining.toFixed(3),
    unitCost: b.unit_cost === null ? null : b.unit_cost.toFixed(2),
    receivedAt: b.received_at,
  }));
}

/** Dashboard/summary cards (section 17). Value = quantity x stored unit_cost -- see docs/modules/INVENTORY.md for the valuation method. */
export async function getInventoryMetrics(organizationId: string): Promise<{
  totalProducts: number;
  totalValue: string;
  lowStockCount: number;
  outOfStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
}> {
  const supabase = await getSupabaseServerClient();

  const [{ count: totalProducts }, valueRows, lowStock, outOfStock, expiring, expired] =
    await Promise.all([
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("inventory")
        .select("quantity_on_hand, products!inner(unit_cost)")
        .eq("organization_id", organizationId),
      supabase
        .from("inventory")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_low_stock", true)
        .gt("quantity_on_hand", 0),
      supabase
        .from("inventory")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .lte("quantity_on_hand", 0),
      supabase
        .from("inventory_batches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gt("quantity_remaining", 0)
        .gte("expiration_date", new Date().toISOString().slice(0, 10))
        .lte("expiration_date", new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)),
      supabase
        .from("inventory_batches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gt("quantity_remaining", 0)
        .lt("expiration_date", new Date().toISOString().slice(0, 10)),
    ]);

  const totalValue = (valueRows.data ?? []).reduce((sum, row) => {
    const unitCost =
      (row as unknown as { products: { unit_cost: number } }).products?.unit_cost ?? 0;
    return sum + row.quantity_on_hand * unitCost;
  }, 0);

  return {
    totalProducts: totalProducts ?? 0,
    totalValue: totalValue.toFixed(2),
    lowStockCount: lowStock.count ?? 0,
    outOfStockCount: outOfStock.count ?? 0,
    expiringSoonCount: expiring.count ?? 0,
    expiredCount: expired.count ?? 0,
  };
}
