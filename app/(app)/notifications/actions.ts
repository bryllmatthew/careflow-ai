"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listMyNotifications, getUnreadNotificationCount } from "./queries";

export async function getNotificationsAction() {
  const [notifications, unreadCount] = await Promise.all([
    listMyNotifications(),
    getUnreadNotificationCount(),
  ]);
  return { notifications, unreadCount };
}

/** RLS restricts this to the caller's own notifications regardless of the id supplied. */
export async function markNotificationReadAction(notificationId: string) {
  const supabase = await getSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const supabase = await getSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  revalidatePath("/", "layout");
}
