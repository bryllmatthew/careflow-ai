"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { findUnsupportedVariables } from "@/lib/automation/render-template";

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

export async function toggleAutomationGroupAction(ruleIds: string[], enabled: boolean) {
  const organizationId = await currentOrganizationId();
  await requirePermission("automations.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("automation_rules").update({ enabled }).in("id", ruleIds);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/notifications");
}

type TemplateUpdate = { subject?: string; body: string; enabled: boolean };

export async function updateReminderTemplateAction(
  templateId: string,
  update: TemplateUpdate,
): Promise<{ error: string } | { error?: undefined }> {
  const organizationId = await currentOrganizationId();
  await requirePermission("automations.manage", { organizationId });

  const unsupported = [
    ...findUnsupportedVariables(update.body),
    ...findUnsupportedVariables(update.subject ?? ""),
  ];
  if (unsupported.length > 0) {
    return { error: `Unsupported variable${unsupported.length > 1 ? "s" : ""}: ${unsupported.map((v) => `{{${v}}}`).join(", ")}` };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("reminder_templates")
    .update({ subject: update.subject || null, body: update.body, enabled: update.enabled })
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/settings/notifications");
  return {};
}
