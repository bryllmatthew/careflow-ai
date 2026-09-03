import { z } from "zod";

/**
 * Shared client/server validation for the (auth) route group. Supabase Auth
 * itself re-validates on the server regardless (never trust the client), but
 * parsing here gives fast, specific field errors before a network round trip.
 */

const email = z.string().trim().min(1, "Email is required").email("Enter a valid email address");

// Supabase Auth's own floor is 6 characters; 8 is a more reasonable minimum
// for a system that will hold patient records.
const password = z.string().min(8, "Password must be at least 8 characters");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(1, "Name is required").max(200),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const requestPasswordResetSchema = z.object({
  email,
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const updatePasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
