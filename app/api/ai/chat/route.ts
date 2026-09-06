import "server-only";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError, ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import { resolveAIContext } from "@/lib/ai/context";
import { createConversation, runAssistantTurn } from "@/lib/ai/service";
import { sendChatMessageSchema } from "@/lib/validation/ai.schema";

/**
 * The one entry point for the assistant UI (app/(app)/assistant). A Route
 * Handler, not a Server Action, because this is where a future streaming
 * upgrade would live (CLAUDE.md: "Route Handlers only for AI streaming,
 * webhooks, and cron") -- see docs/modules/AI_ASSISTANT.md "Deferred" for
 * why this version is not yet streaming.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = sendChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const ctx = await resolveAIContext();
    // ai.use gates the assistant itself, independent of any individual
    // tool's own permission (docs/AI_TOOLS.md section 4/nav gating).
    await requirePermission("ai.use", { organizationId: ctx.organizationId });

    const conversationId = parsed.data.conversationId ?? (await createConversation(ctx));
    const result = await runAssistantTurn(conversationId, ctx, parsed.data.message);

    if (!result.success) {
      return NextResponse.json({ conversationId, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      conversationId,
      reply: result.reply,
      toolActivity: result.toolActivity,
      pendingActions: result.pendingActions,
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof NotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[ai/chat] unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
