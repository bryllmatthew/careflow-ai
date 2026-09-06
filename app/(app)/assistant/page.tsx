import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { NotFoundError } from "@/lib/auth/errors";
import { PageHeader } from "@/components/patterns/page-header";
import { resolveAIContext } from "@/lib/ai/context";
import { listConversations, getConversationDisplayMessages } from "@/lib/ai/service";
import { AssistantChat } from "./assistant-chat";

export default async function AiAssistantPage() {
  const auth = await getAuthContext();
  const organizationId = auth?.memberships[0]?.organizationId;
  if (!organizationId) throw new NotFoundError("No active organization.");

  await requirePermission("ai.use", { organizationId });

  const ctx = await resolveAIContext();
  const conversations = await listConversations(ctx);
  const latest = conversations[0];
  const initialMessages = latest ? await getConversationDisplayMessages(latest.id) : [];

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <PageHeader
        title="AI Assistant"
        description="Ask about revenue, appointments, patients, follow-ups, or inventory."
      />
      <AssistantChat initialConversationId={latest?.id ?? null} initialMessages={initialMessages} />
    </div>
  );
}
