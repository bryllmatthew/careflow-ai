import { z } from "zod";

export const sendChatMessageSchema = z.object({
  conversationId: z.string().uuid().optional().describe("Omit to start a new conversation."),
  message: z.string().trim().min(1).max(4000),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const confirmActionSchema = z.object({
  conversationId: z.string().uuid(),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});
export type ConfirmActionInput = z.infer<typeof confirmActionSchema>;
