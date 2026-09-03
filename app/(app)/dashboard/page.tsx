import { DollarSign, CalendarCheck, UserPlus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { StatTile } from "@/components/patterns/stat-tile";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The four top-level metrics from docs/UI_UX_SPEC.md ("Dashboard"). All show
 * an honest "no data yet" placeholder -- revenue, appointments, patients and
 * invoices don't exist until Phase 2/3/5. Task 1.16 wires the charts,
 * clinic comparison, upcoming appointments and AI insight card described in
 * the same spec section once Phase 8 gives them real data to show.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your business at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue" value={null} icon={DollarSign} />
        <StatTile label="Appointments" value={null} icon={CalendarCheck} />
        <StatTile label="New patients" value={null} icon={UserPlus} />
        <StatTile label="Outstanding payments" value={null} icon={Wallet} />
      </div>

      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Business metrics appear here once scheduling, sales and payments are set up.
        </CardContent>
      </Card>
    </div>
  );
}
