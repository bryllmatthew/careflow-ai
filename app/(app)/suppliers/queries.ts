import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const SUPPLIERS_PAGE_SIZE = 20;

export type SupplierRow = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

const SUPPLIER_SELECT =
  "id, name, contact_person, email, phone, address, notes, status, created_at";

function mapSupplier(s: {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}): SupplierRow {
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contact_person,
    email: s.email,
    phone: s.phone,
    address: s.address,
    notes: s.notes,
    status: s.status,
    createdAt: s.created_at,
  };
}

export async function listSuppliers(
  organizationId: string,
  filters: { q?: string; status?: "active" | "inactive" | "all"; page?: number },
): Promise<{ rows: SupplierRow[]; total: number }> {
  const supabase = await getSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * SUPPLIERS_PAGE_SIZE;
  const to = from + SUPPLIERS_PAGE_SIZE - 1;

  let query = supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT, { count: "exact" })
    .eq("organization_id", organizationId);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else if (!filters.status) {
    query = query.eq("status", "active");
  }
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    query = query.or(`name.ilike.%${q}%,contact_person.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, count } = await query.order("name").range(from, to);
  return { rows: (data ?? []).map(mapSupplier), total: count ?? 0 };
}

export async function getSupplierById(supplierId: string): Promise<SupplierRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT)
    .eq("id", supplierId)
    .maybeSingle();
  return data ? mapSupplier(data) : null;
}

export async function listSupplierOptions(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("name");
  return data ?? [];
}
