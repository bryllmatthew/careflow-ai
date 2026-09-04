import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAutomationToggles, listReminderTemplates, listAutomationActivity } from "./queries";
import { AutomationToggleList } from "./automation-toggle-list";
import { TemplateEditor } from "./template-editor";
import { AutomationActivityTable } from "./automation-activity-table";

export default async function NotificationsSettingsPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("automations.view", { organizationId });

  const [toggles, templates, activity, canManage] = await Promise.all([
    getAutomationToggles(organizationId),
    listReminderTemplates(organizationId),
    listAutomationActivity(organizationId),
    can("automations.manage", { organizationId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Appointment reminders, follow-up automation and activity."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation</CardTitle>
        </CardHeader>
        <CardContent>
          <AutomationToggleList toggles={toggles} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message Templates</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-muted-foreground text-xs">
                  {t.channel} · {t.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              {canManage ? (
                <TemplateEditor template={t} />
              ) : (
                <p className="text-muted-foreground text-xs">View only</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation Activity</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <AutomationActivityTable rows={activity} />
        </CardContent>
      </Card>
    </div>
  );
}
