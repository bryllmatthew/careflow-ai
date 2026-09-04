"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError, UnauthenticatedError } from "@/lib/auth/errors";
import { followUpFormSchema, type FollowUpFormInput } from "@/lib/validation/followup.schema";
import type { FollowUpStatus } from "@/lib/validation/followup.schema";
import type { Database } from "@/lib/db/types.generated";

type FollowUpUpdate = Database["public"]["Tables"]["follow_ups"]["Update"];

async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

type ActionResult = { error: string } | { error?: undefined };

export async function createFollowUpAction(input: FollowUpFormInput): Promise<ActionResult> {
  const parsed = followUpFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  const auth = await getAuthContext();
  await requirePermission("followups.create", { organizationId, clinicId: parsed.data.clinicId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("follow_ups").insert({
    organization_id: organizationId,
    clinic_id: parsed.data.clinicId,
    patient_id: parsed.data.patientId,
    type: parsed.data.type,
    priority: parsed.data.priority,
    due_at: new Date(parsed.data.dueAt).toISOString(),
    assigned_to: parsed.data.assignedTo ?? null,
    notes: parsed.data.notes ?? null,
    created_by: auth?.userId ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/followups");
  return {};
}

/**
 * Reassign / change priority / change due date / edit notes -- the broader
 * "manage" surface. Completing or updating just the status is a separate,
 * narrower action (updateFollowUpStatusAction) usable by an assigned
 * practitioner who doesn't hold followups.manage.
 */
export async function updateFollowUpAction(
  followUpId: string,
  updates: Partial<Pick<FollowUpFormInput, "priority" | "dueAt" | "assignedTo" | "notes" | "type">>,
): Promise<ActionResult> {
  const organizationId = await currentOrganizationId();
  await requirePermission("followups.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const patch: FollowUpUpdate = {};
  if (updates.type !== undefined) patch.type = updates.type;
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.dueAt !== undefined) patch.due_at = new Date(updates.dueAt).toISOString();
  if (updates.assignedTo !== undefined) patch.assigned_to = updates.assignedTo || null;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;

  const { data, error } = await supabase
    .from("follow_ups")
    .update(patch)
    .eq("id", followUpId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Follow-up not found, or you don't have access to it." };

  revalidatePath("/followups");
  return {};
}

/**
 * The narrow action: change status / add a note while completing. Gated by
 * followups.view at the RLS layer (see migration 0014's follow_ups_update
 * policy) -- a holder of only followups.view who is this follow-up's
 * assigned_to can still call this; requirePermission() here checks the same
 * followups.view floor, and RLS is what actually decides row-by-row whether
 * they may touch THIS particular follow-up.
 */
export async function updateFollowUpStatusAction(
  followUpId: string,
  status: FollowUpStatus,
  notes?: string,
) {
  const organizationId = await currentOrganizationId();
  await requirePermission("followups.view", { organizationId });

  const supabase = await getSupabaseServerClient();
  const patch: FollowUpUpdate = { status };
  if (status === "completed") patch.completed_at = new Date().toISOString();
  if (notes !== undefined) patch.notes = notes;

  const { data, error } = await supabase
    .from("follow_ups")
    .update(patch)
    .eq("id", followUpId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new NotFoundError(
      "Follow-up not found, or you don't have permission to update it -- only the assigned staff member or someone with follow-up management access can.",
    );
  }

  revalidatePath("/followups");
}

export async function cancelFollowUpAction(followUpId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("followups.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .update({ status: "cancelled" })
    .eq("id", followUpId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Follow-up not found, or you don't have access to it.");

  revalidatePath("/followups");
}
