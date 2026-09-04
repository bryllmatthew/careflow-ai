"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { AutomationToggle } from "./queries";
import { toggleAutomationGroupAction } from "./actions";

export function AutomationToggleList({ toggles, canManage }: { toggles: AutomationToggle[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();

  const reminders = toggles.filter((t) => t.actionType === "reminder");
  const followUps = toggles.filter((t) => t.actionType === "followup");

  function toggle(t: AutomationToggle, next: boolean) {
    startTransition(async () => {
      try {
        await toggleAutomationGroupAction(t.ruleIds, next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update this setting.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-medium">Appointment Reminders</h3>
        <div className="flex flex-col divide-y rounded-lg border">
          {reminders.map((t) => (
            <div key={t.displayKey} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{t.label}</span>
              <Switch
                checked={t.enabled}
                disabled={!canManage || pending}
                onCheckedChange={(checked) => toggle(t, checked)}
                aria-label={t.label}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Follow-Ups</h3>
        <div className="flex flex-col divide-y rounded-lg border">
          {followUps.map((t) => (
            <div key={t.displayKey} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{t.label}</span>
              <Switch
                checked={t.enabled}
                disabled={!canManage || pending}
                onCheckedChange={(checked) => toggle(t, checked)}
                aria-label={t.label}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
