"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

/**
 * Wraps a trigger with an "are you sure" step before running a Server
 * Action. Reports the action's own error message via toast rather than
 * assuming success -- callers throw on failure (e.g. requirePermission()'s
 * ForbiddenError) or return normally on success.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Continue",
  destructive = true,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={
              destructive ? "bg-destructive hover:bg-destructive/90 text-white" : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Something went wrong.");
                }
              });
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
