import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

/** RLS already scopes this to the caller's own inbox (user_id = auth.uid()) -- no organizationId needed. */
export async function listMyNotifications(limit = 20): Promise<NotificationRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, message, entity_type, entity_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    entityType: n.entity_type,
    entityId: n.entity_id,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
