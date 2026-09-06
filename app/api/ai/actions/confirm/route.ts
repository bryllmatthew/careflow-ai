import "server-only";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError, ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import { resolveAIContext } from "@/lib/ai/context";
import { executeConfirmedAction } from "@/lib/ai/tools/registry";
import { confirmActionSchema } from "@/lib/validation/ai.schema";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The propose -> confirm -> execute -> audit flow's "execute" step
 * (docs/AI_TOOLS.md sections 16/17): only ever runs after the UI's explicit
 * Confirm button, and independently re-checks permission and input --
 * exactly like the chat tool loop, minus the model in between. Called
 * SEPARATELY from app/api/ai/chat so a confirmation never depends on
 * replaying the whole conversation back through the model.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = confirmActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const ctx = await resolveAIContext();
    await requirePermission("ai.use", { organizationId: ctx.organizationId });

    // Ownership check: a confirm request must name a conversation this user
    // actually owns -- RLS already enforces this on every ai_conversations
    // read, this just turns a would-be empty-result into a clear 404.
    const supabase = await getSupabaseServerClient();
    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", parsed.data.conversationId)
      .maybeSingle();
    if (!conversation)
      throw new NotFoundError("Conversation not found, or you don't have access to it.");

    const result = await executeConfirmedAction({
      toolName: parsed.data.toolName,
      rawInput: parsed.data.input,
      ctx,
      conversationId: parsed.data.conversationId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data });
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof NotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[ai/actions/confirm] unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
