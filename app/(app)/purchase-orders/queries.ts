import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const PURCHASE_ORDERS_PAGE_SIZE = 20;

export type PurchaseOrderRow = {
  id: string;
  purchaseOrderNumber: string | null;
  status: string;
  clinicId: string;
  clinicName: string | null;
  supplierId: string;
  supplierName: string;
  orderDate: string | null;
  expectedDate: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  createdAt: string;
};

const PO_SELECT =
  "id, purchase_order_number, status, clinic_id, supplier_id, order_date, expected_date, subtotal, tax_amount, total, created_at, " +
  "clinics(name), suppliers(name)";

type RawPO = {
  id: string;
  purchase_order_number: string | null;
  status: string;
  clinic_id: string;
  supplier_id: string;
  order_date: string | null;
  expected_date: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  created_at: string;
  clinics: { name: string } | null;
  suppliers: { name: string } | null;
};

function mapPO(p: RawPO): PurchaseOrderRow {
  return {
    id: p.id,
    purchaseOrderNumber: p.purchase_order_number,
    status: p.status,
    clinicId: p.clinic_id,
    clinicName: p.clinics?.name ?? null,
    supplierId: p.supplier_id,
    supplierName: p.suppliers?.name ?? "Unknown supplier",
    orderDate: p.order_date,
    expectedDate: p.expected_date,
    subtotal: p.subtotal.toFixed(2),
    taxAmount: p.tax_amount.toFixed(2),
    total: p.total.toFixed(2),
    createdAt: p.created_at,
  };
}

export type PurchaseOrderListFilters = {
  q?: string;
  clinicId?: string;
  supplierId?: string;
  status?: string;
  page?: number;
};

export async function listPurchaseOrders(
  organizationId: string,
  filters: PurchaseOrderListFilters,
): Promise<{ rows: PurchaseOrderRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PURCHASE_ORDERS_PAGE_SIZE;
  const to = from + PURCHASE_ORDERS_PAGE_SIZE - 1;

  let query = supabase
    .from("purchase_orders")
    .select(PO_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.clinicId) query = query.eq("clinic_id", filters.clinicId);
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q && filters.q.trim()) {
    query = query.ilike("purchase_order_number", `%${filters.q.trim()}%`);
  }

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  return { rows: (data ?? []).map((p) => mapPO(p as unknown as RawPO)), total: count ?? 0 };
}

export type PurchaseOrderItemRow = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  description: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitCost: string;
  totalCost: string;
};

export type PurchaseOrderDetail = PurchaseOrderRow & {
  notes: string | null;
  taxRate: string;
  items: PurchaseOrderItemRow[];
};

export async function getPurchaseOrderById(
  purchaseOrderId: string,
): Promise<PurchaseOrderDetail | null> {
  const supabase = await getSupabaseServerClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select(`${PO_SELECT}, notes, tax_rate`)
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (!po) return null;

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select(
      "id, product_id, description, quantity_ordered, quantity_received, unit_cost, total_cost, products(name, sku)",
    )
    .eq("purchase_order_id", purchaseOrderId)
    .order("created_at");

  const raw = po as unknown as RawPO & { notes: string | null; tax_rate: number };

  return {
    ...mapPO(raw),
    notes: raw.notes,
    taxRate: raw.tax_rate.toFixed(2),
    items: (items ?? []).map((i) => ({
      id: i.id,
      productId: i.product_id,
      productName: i.products?.name ?? "Unknown product",
      sku: i.products?.sku ?? null,
      description: i.description,
      quantityOrdered: i.quantity_ordered.toFixed(3),
      quantityReceived: i.quantity_received.toFixed(3),
      unitCost: i.unit_cost.toFixed(2),
      totalCost: (i.total_cost ?? 0).toFixed(2),
    })),
  };
}

/** For the dashboard/reports (section 27) -- DB-aggregated. */
export async function getPurchaseOrderMetrics(
  organizationId: string,
): Promise<{ openCount: number; awaitingReceiptValue: string }> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select("total")
    .eq("organization_id", organizationId)
    .in("status", ["ordered", "partially_received"]);

  const awaitingReceiptValue = (data ?? []).reduce((sum, r) => sum + r.total, 0);
  return { openCount: data?.length ?? 0, awaitingReceiptValue: awaitingReceiptValue.toFixed(2) };
}
