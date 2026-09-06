import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const PRODUCTS_PAGE_SIZE = 20;

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  unitOfMeasure: string;
  unitCost: string;
  sellingPrice: string | null;
  currency: string;
  trackInventory: boolean;
  trackExpiration: boolean;
  reorderLevel: string;
  reorderQuantity: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierSku: string | null;
  status: string;
  createdAt: string;
};

type RawProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  unit_of_measure: string;
  unit_cost: number;
  selling_price: number | null;
  currency: string;
  track_inventory: boolean;
  track_expiration: boolean;
  reorder_level: number;
  reorder_quantity: number;
  supplier_id: string | null;
  supplier_sku: string | null;
  status: string;
  created_at: string;
  suppliers: { name: string } | null;
};

const PRODUCT_SELECT =
  "id, name, sku, barcode, category, brand, unit_of_measure, unit_cost, selling_price, currency, " +
  "track_inventory, track_expiration, reorder_level, reorder_quantity, supplier_id, supplier_sku, status, " +
  "created_at, suppliers(name)";

function mapProduct(p: RawProduct): ProductRow {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    category: p.category,
    brand: p.brand,
    unitOfMeasure: p.unit_of_measure,
    unitCost: p.unit_cost.toFixed(2),
    sellingPrice: p.selling_price === null ? null : p.selling_price.toFixed(2),
    currency: p.currency,
    trackInventory: p.track_inventory,
    trackExpiration: p.track_expiration,
    reorderLevel: p.reorder_level.toFixed(3),
    reorderQuantity: p.reorder_quantity.toFixed(3),
    supplierId: p.supplier_id,
    supplierName: p.suppliers?.name ?? null,
    supplierSku: p.supplier_sku,
    status: p.status,
    createdAt: p.created_at,
  };
}

export type ProductListFilters = {
  q?: string;
  category?: string;
  status?: "active" | "inactive" | "all";
  supplierId?: string;
  page?: number;
};

export async function listProducts(
  organizationId: string,
  filters: ProductListFilters,
): Promise<{ rows: ProductRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PRODUCTS_PAGE_SIZE;
  const to = from + PRODUCTS_PAGE_SIZE - 1;

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else if (!filters.status) {
    query = query.eq("status", "active");
  }
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`);
  }

  const { data, count } = await query.order("name").range(from, to);

  return {
    rows: (data ?? []).map((p) => mapProduct(p as unknown as RawProduct)),
    total: count ?? 0,
  };
}

export async function getProductById(productId: string): Promise<ProductRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();
  return data ? mapProduct(data as unknown as RawProduct) : null;
}

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  unitOfMeasure: string;
  unitCost: string;
  trackInventory: boolean;
  trackExpiration: boolean;
};

export async function listProductOptions(organizationId: string): Promise<ProductOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, sku, unit_of_measure, unit_cost, track_inventory, track_expiration")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("name");

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    unitOfMeasure: p.unit_of_measure,
    unitCost: p.unit_cost.toFixed(2),
    trackInventory: p.track_inventory,
    trackExpiration: p.track_expiration,
  }));
}

export async function listProductCategories(organizationId: string): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select("category")
    .eq("organization_id", organizationId)
    .not("category", "is", null);
  const set = new Set((data ?? []).map((r) => r.category).filter((c): c is string => Boolean(c)));
  return Array.from(set).sort();
}

/** Products this product's clinic-level stock lives at, for the product detail page. */
export type ProductInventoryRow = {
  clinicId: string;
  clinicName: string;
  quantityOnHand: string;
  reorderLevel: string;
  reorderQuantity: string;
  lastReceivedAt: string | null;
  lastUsedAt: string | null;
};

export async function listProductInventoryByClinic(
  productId: string,
): Promise<ProductInventoryRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("inventory")
    .select(
      "clinic_id, quantity_on_hand, reorder_level, reorder_quantity, last_received_at, last_used_at, clinics(name)",
    )
    .eq("product_id", productId)
    .order("clinic_id");

  return (data ?? []).map((r) => ({
    clinicId: r.clinic_id,
    clinicName: (r.clinics as { name: string } | null)?.name ?? "Unknown clinic",
    quantityOnHand: r.quantity_on_hand.toFixed(3),
    reorderLevel: r.reorder_level.toFixed(3),
    reorderQuantity: r.reorder_quantity.toFixed(3),
    lastReceivedAt: r.last_received_at,
    lastUsedAt: r.last_used_at,
  }));
}
