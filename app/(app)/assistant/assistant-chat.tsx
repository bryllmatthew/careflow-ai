"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/patterns/empty-state";
import { toast } from "sonner";

type DisplayMessage = { id: string; role: "user" | "assistant"; text: string };
type PendingAction = {
  toolName: string;
  input: unknown;
  summary: string;
  details: Record<string, unknown>;
};

type ChatMessage =
  | DisplayMessage
  | {
      id: string;
      role: "action";
      action: PendingAction;
      resolved: "confirmed" | "cancelled" | null;
    };

/**
 * Props are plain serializable data from the Server Component page
 * (app/(app)/assistant/page.tsx) -- no functions cross that boundary, the
 * same lesson from the dashboard TrendChart fix (components/patterns/trend-chart.tsx).
 */
export function AssistantChat({
  initialConversationId,
  initialMessages,
}: {
  initialConversationId: string | null;
  initialMessages: DisplayMessage[];
}) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", text }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "The assistant couldn't respond.");
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            text: data.error ?? "Something went wrong.",
          },
        ]);
        return;
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: `reply-${Date.now()}`, role: "assistant", text: data.reply },
        ...(data.pendingActions as PendingAction[]).map((action, i) => ({
          id: `action-${Date.now()}-${i}`,
          role: "action" as const,
          action,
          resolved: null,
        })),
      ]);
    } catch {
      toast.error("Could not reach the assistant.");
    } finally {
      setSending(false);
    }
  }

  async function confirmAction(messageId: string, action: PendingAction) {
    if (!conversationId) return;
    try {
      const res = await fetch("/api/ai/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, toolName: action.toolName, input: action.input }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't complete that action.");
        return;
      }
      toast.success("Done.");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.role === "action" ? { ...m, resolved: "confirmed" } : m,
        ),
      );
    } catch {
      toast.error("Couldn't reach the server.");
    }
  }

  function cancelAction(messageId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.role === "action" ? { ...m, resolved: "cancelled" } : m,
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex-1 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Ask me anything"
            description="Try: “How much revenue did we collect this month?” or “Who has overdue follow-ups?”"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) =>
              m.role === "action" ? (
                <ActionCard
                  key={m.id}
                  message={m}
                  onConfirm={() => confirmAction(m.id, m.action)}
                  onCancel={() => cancelAction(m.id)}
                />
              ) : (
                <div
                  key={m.id}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      m.role === "user"
                        ? "bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                        : "bg-muted max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ),
            )}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about revenue, appointments, patients, follow-ups, inventory..."
          className="min-h-11 resize-none"
          disabled={sending}
        />
        <Button onClick={send} disabled={sending || !input.trim()} size="icon" aria-label="Send">
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}

function ActionCard({
  message,
  onConfirm,
  onCancel,
}: {
  message: Extract<ChatMessage, { role: "action" }>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="max-w-[80%] border-dashed">
      <CardContent className="flex flex-col gap-3 py-3">
        <p className="text-sm font-medium">{message.action.summary}</p>
        {message.resolved === null && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onConfirm}>
              <Check /> Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              <X /> Cancel
            </Button>
          </div>
        )}
        {message.resolved === "confirmed" && (
          <p className="text-muted-foreground text-xs">Confirmed.</p>
        )}
        {message.resolved === "cancelled" && (
          <p className="text-muted-foreground text-xs">Cancelled.</p>
        )}
      </CardContent>
    </Card>
  );
}
