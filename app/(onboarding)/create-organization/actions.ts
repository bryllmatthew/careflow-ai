"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createOrganizationSchema } from "@/lib/validation/organization.schema";

export type CreateOrganizationActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createOrganizationAction(
  _prevState: CreateOrganizationActionState,
  formData: FormData,
): Promise<CreateOrganizationActionState> {
  const parsed = createOrganizationSchema.safeParse({
    orgName: formData.get("orgName"),
    businessType: formData.get("businessType"),
    clinicName: formData.get("clinicName"),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(flat)) {
      if (value) fieldErrors[key] = value;
    }
    return { fieldErrors };
  }

  const supabase = await getSupabaseServerClient();

  // requirePermission()-style checks don't apply here: creating an
  // organization is the one action available to any authenticated user with
  // zero existing grants. The RPC itself enforces auth.uid() is non-null.
  const { error } = await supabase.rpc("create_organization", {
    p_org_name: parsed.data.orgName,
    p_business_type: parsed.data.businessType,
    p_clinic_name: parsed.data.clinicName || undefined,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
