import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  roleId: z.string().min(1, "Select a role"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
