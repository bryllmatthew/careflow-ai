"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/lib/validation/auth.schema";

export type CompleteInviteState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Requires an active session already established client-side by
 * app/accept-invite/page.tsx (GoTrue's invite link uses the implicit flow --
 * tokens arrive in the URL fragment, which never reaches the server, so
 * setSession() must happen in the browser first; @supabase/ssr's browser
 * client persists that session to cookies, which is what makes it visible
 * here).
 */
export async function completeInviteAction(
  _prevState: CompleteInviteState,
  formData: FormData,
): Promise<CompleteInviteState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your invite link has expired. Ask an admin to resend it." };
  }

  // Set server-side by inviteUserAction's own admin call -- never a
  // client-supplied organization_id.
  const organizationId = user.user_metadata?.invited_organization_id;
  if (typeof organizationId !== "string") {
    return { error: "This invite link is missing its organization. Ask an admin to resend it." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: (parsed.data as UpdatePasswordInput).password,
  });
  if (passwordError) {
    return { error: passwordError.message };
  }

  const { error: acceptError } = await supabase.rpc("accept_invite", {
    p_organization_id: organizationId,
  });
  if (acceptError) {
    return { error: acceptError.message };
  }

  redirect("/");
}
