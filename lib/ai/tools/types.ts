import type { z } from "zod";
import type { Permission } from "@/lib/auth/permissions";
import type { AIContext } from "@/lib/ai/context";

export type AIToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export type ReadTool<TSchema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: TSchema;
  /**
   * Permission(s) required beyond the baseline `ai.use` (checked once per
   * chat request) -- every read tool needs at least one; see
   * docs/AI_TOOLS.md section 5 ("verify required permission"). An array is
   * any-of: e.g. patients.view OR patients.view.assigned, matching the
   * broad/assigned split every other patient-facing view in the app uses
   * (docs/AUTHORIZATION.md section 5.6) -- RLS still scopes the actual rows
   * returned regardless of which branch grants tool access.
   */
  permission: Permission | Permission[];
  isAction?: false;
  handler: (input: z.infer<TSchema>, ctx: AIContext) => Promise<AIToolResult>;
};

export type ActionTool<TSchema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: TSchema;
  permission: Permission | Permission[];
  isAction: true;
  /**
   * Builds a human-readable confirmation summary WITHOUT performing the
   * action (docs/AI_TOOLS.md section 17: "the AI should ask for
   * confirmation before high-impact actions"). Called from the normal
   * chat tool-loop.
   */
  propose: (
    input: z.infer<TSchema>,
    ctx: AIContext,
  ) => Promise<{ summary: string; details: Record<string, unknown> }>;
  /**
   * Performs the real mutation by calling the SAME existing Server Action
   * every human-driven UI flow calls (never a parallel write path) --
   * CLAUDE.md section 66. Only ever invoked from the confirmed-action route
   * (app/api/ai/actions/confirm/route.ts) after the user has explicitly
   * confirmed the proposal, never directly from the model's tool_use block.
   */
  execute: (input: z.infer<TSchema>, ctx: AIContext) => Promise<AIToolResult>;
};

export type AITool = ReadTool | ActionTool;

export function isActionTool(tool: AITool): tool is ActionTool {
  return tool.isAction === true;
}

/**
 * Factory functions, not plain object literals with a `: ReadTool`
 * annotation -- an object literal typed directly as `ReadTool` (no type
 * argument) defaults `TSchema` to the base `z.ZodType`, which erases the
 * specific shape and makes every `handler`'s `input` parameter `unknown` at
 * the definition site. Going through a generic function lets TypeScript
 * infer `TSchema` from the `schema` field actually passed in, so each
 * tool's handler gets its real, specific input type -- then returns the
 * (deliberately) erased `ReadTool`/`ActionTool` shape the registry stores
 * tools as. The cast is contained to these two functions rather than
 * scattered across every tool file.
 */
export function defineReadTool<TSchema extends z.ZodType>(tool: ReadTool<TSchema>): ReadTool {
  return tool as unknown as ReadTool;
}

export function defineActionTool<TSchema extends z.ZodType>(
  tool: Omit<ActionTool<TSchema>, "isAction">,
): ActionTool {
  return { ...tool, isAction: true } as unknown as ActionTool;
}
