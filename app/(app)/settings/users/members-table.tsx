"use client";

import { useState, useTransition } from "react";
import { X, MoreHorizontal, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import { setMemberStatusAction, grantRoleAction, revokeRoleAction } from "./actions";

export type MemberRow = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string;
  status: string;
  isSelf: boolean;
  grants: { userRoleId: string; roleKey: string; roleName: string; orgWide: boolean }[];
};

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  invited: "secondary",
  suspended: "destructive",
  removed: "destructive",
};

export function MembersTable({
  members,
  roles,
  canManageStatus,
  canManageRoles,
}: {
  members: MemberRow[];
  roles: { id: string; name: string }[];
  canManageStatus: boolean;
  canManageRoles: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);

  function runStatus(member: MemberRow, status: "active" | "suspended" | "removed") {
    startTransition(async () => {
      try {
        await setMemberStatusAction(member.membershipId, status);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update status.");
      }
    });
  }

  function runGrant(member: MemberRow, roleId: string) {
    startTransition(async () => {
      try {
        await grantRoleAction(member.userId, roleId);
        setAddingRoleFor(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't grant role.");
      }
    });
  }

  function runRevoke(userRoleId: string) {
    startTransition(async () => {
      try {
        await revokeRoleAction(userRoleId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't revoke role.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.membershipId}>
            <TableCell>
              <div className="font-medium">{m.fullName ?? m.email}</div>
              <div className="text-muted-foreground text-sm">{m.email}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1.5">
                {m.grants.map((g) => (
                  <Badge key={g.userRoleId} variant="outline" className="gap-1 pr-1">
                    {g.roleName}
                    {canManageRoles && (
                      <button
                        type="button"
                        onClick={() => runRevoke(g.userRoleId)}
                        disabled={pending}
                        aria-label={`Remove ${g.roleName}`}
                        className="hover:bg-muted rounded-full p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {canManageRoles &&
                  (addingRoleFor === m.membershipId ? (
                    <Select onValueChange={(roleId) => runGrant(m, roleId)}>
                      <SelectTrigger className="h-7 w-40">
                        <SelectValue placeholder="Select role…" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles
                          .filter((r) => !m.grants.some((g) => g.roleName === r.name))
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => setAddingRoleFor(m.membershipId)}
                      aria-label="Add role"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  ))}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[m.status] ?? "secondary"}>{m.status}</Badge>
            </TableCell>
            <TableCell>
              {canManageStatus && !m.isSelf && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${m.fullName ?? m.email}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {m.status !== "active" && (
                      <DropdownMenuItem onSelect={() => runStatus(m, "active")}>
                        Reactivate
                      </DropdownMenuItem>
                    )}
                    {m.status === "active" && (
                      <DropdownMenuItem onSelect={() => runStatus(m, "suspended")}>
                        Suspend
                      </DropdownMenuItem>
                    )}
                    <ConfirmDialog
                      trigger={
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          Remove from organization
                        </DropdownMenuItem>
                      }
                      title={`Remove ${m.fullName ?? m.email}?`}
                      description="They'll lose all access to this organization immediately."
                      confirmLabel="Remove"
                      onConfirm={async () => runStatus(m, "removed")}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
