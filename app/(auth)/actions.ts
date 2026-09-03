"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import {
  loginSchema,
  signupSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth.schema";

/**
 * Shape returned to useActionState. Never thrown for expected failures (bad
 * credentials, validation errors) -- only for truly exceptional conditions,
 * so the client always gets a field-level error to render.
 */
export type AuthActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function firstFieldErrors(flat: Record<string, string[] | undefined>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value) out[key] = value;
  }
  return out;
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Deliberately generic: distinguishing "no such user" from "wrong
    // password" lets an attacker enumerate registered emails.
    return { error: "Incorrect email or password." };
  }

  redirect("/");
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/create-organization`,
    },
  });
  if (error) {
    return { error: error.message };
  }

  redirect("/signup/check-email");
}

export async function logoutAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = requestPasswordResetSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await getSupabaseServerClient();
  // Errors are intentionally not surfaced: doing so would let a caller
  // enumerate which emails have an account. Always route to the same
  // "check your email" screen regardless of outcome.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/update-password`,
  });

  redirect("/reset-password/check-email");
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await getSupabaseServerClient();
  // Requires an active recovery session, established by /auth/callback
  // exchanging the code from the password-reset email link.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
