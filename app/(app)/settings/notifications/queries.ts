import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RuleConfig = {
  reminder_type?: string;
  followup_type?: string;
  hours_before?: number;
  due_in_hours?: number;
};

export type AutomationToggle = {
  /** config.reminder_type or config.followup_type -- what templates key against. */
  displayKey: string;
  label: string;
  actionType: "reminder" | "followup";
  enabled: boolean;
  /** Every automation_rules row (there can be more than one trigger for the same reminder_type) folded into this toggle. */
  ruleIds: string[];
};

/**
 * Folds the 7 seeded automation_rules rows (migration 0014) down to the 5
 * toggles docs/PRODUCT_SPEC.md Phase 4 section 33's settings mockup shows --
 * the confirm- and reschedule-triggered 24-hour reminder are two separate
 * rules under the hood (independently idempotent, independently loggable)
 * but one concept to a clinic user, so they share one toggle.
 */
export async function getAutomationToggles(organizationId: string): Promise<AutomationToggle[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("automation_rules")
    .select("id, action_type, enabled, config")
    .eq("organization_id", organizationId);

  const groups = new Map<string, AutomationToggle>();
  for (const rule of data ?? []) {
    const config = rule.config as RuleConfig;
    const key = config.reminder_type ?? config.followup_type;
    if (!key) continue;

    const existing = groups.get(key);
    if (existing) {
      existing.ruleIds.push(rule.id);
      existing.enabled = existing.enabled && rule.enabled;
    } else {
      groups.set(key, {
        displayKey: key,
        label: LABELS[key] ?? key,
        actionType: rule.action_type as "reminder" | "followup",
        enabled: rule.enabled,
        ruleIds: [rule.id],
      });
    }
  }

  return DISPLAY_ORDER.map((key) => groups.get(key)).filter(
    (t): t is AutomationToggle => t !== undefined,
  );
}

const LABELS: Record<string, string> = {
  confirmation: "Booking confirmation",
  reminder_24h: "24 hours before",
  reminder_2h: "2 hours before",
  post_appointment: "After completed appointment",
  no_show: "After no-show",
};

const DISPLAY_ORDER = [
  "confirmation",
  "reminder_24h",
  "reminder_2h",
  "post_appointment",
  "no_show",
];

export type ReminderTemplateRow = {
  id: string;
  actionKey: string;
  channel: string;
  name: string;
  subject: string | null;
  body: string;
  enabled: boolean;
};

export async function listReminderTemplates(
  organizationId: string,
): Promise<ReminderTemplateRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("reminder_templates")
    .select("id, action_key, channel, name, subject, body, enabled")
    .eq("organization_id", organizationId)
    .order("action_key");

  return (data ?? []).map((t) => ({
    id: t.id,
    actionKey: t.action_key,
    channel: t.channel,
    name: t.name,
    subject: t.subject,
    body: t.body,
    enabled: t.enabled,
  }));
}

export type AutomationActivityRow = {
  id: string;
  kind: "reminder" | "followup";
  label: string;
  patientName: string;
  status: string;
  timestamp: string;
  failureReason: string | null;
};

/** A recent, read-only feed across both reminders and follow-ups (docs/PRODUCT_SPEC.md Phase 4 section 23). */
export async function listAutomationActivity(
  organizationId: string,
  limit = 25,
): Promise<AutomationActivityRow[]> {
  const supabase = await getSupabaseServerClient();

  const [remindersRes, followUpsRes] = await Promise.all([
    supabase
      .from("reminders")
      .select(
        "id, reminder_type, status, failure_reason, created_at, patients(first_name, last_name)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("follow_ups")
      .select("id, type, status, created_at, patients(first_name, last_name)")
      .eq("organization_id", organizationId)
      .not("automation_rule_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const reminderRows: AutomationActivityRow[] = (remindersRes.data ?? []).map((r) => ({
    id: r.id,
    kind: "reminder",
    label: r.reminder_type,
    patientName: r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "Unknown",
    status: r.status,
    timestamp: r.created_at,
    failureReason: r.failure_reason,
  }));

  const followUpRows: AutomationActivityRow[] = (followUpsRes.data ?? []).map((f) => ({
    id: f.id,
    kind: "followup",
    label: f.type,
    patientName: f.patients ? `${f.patients.first_name} ${f.patients.last_name}` : "Unknown",
    status: f.status,
    timestamp: f.created_at,
    failureReason: null,
  }));

  return [...reminderRows, ...followUpRows]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
