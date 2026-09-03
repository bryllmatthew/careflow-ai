import { ShieldOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(auth)/actions";

/**
 * Reached by someone with a valid session but zero ACTIVE memberships who
 * previously had at least one -- i.e. every one of their memberships is
 * suspended or removed. Kept distinct from /create-organization: without
 * this page, that route's "create your organization" copy is actively
 * misleading for someone who has just been locked out of an existing one,
 * even though the actual access control (RLS + getAuthContext filtering to
 * status='active') was already correct either way.
 */
export default function NoAccessPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldOff className="text-muted-foreground size-5" aria-hidden />
          <CardTitle>Access paused</CardTitle>
        </div>
        <CardDescription>
          Your access to your organization has been paused. Contact an administrator there if you
          believe this is a mistake.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
