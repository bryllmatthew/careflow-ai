"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { renderTemplate, TEMPLATE_VARIABLES } from "@/lib/automation/render-template";
import type { ReminderTemplateRow } from "./queries";
import { updateReminderTemplateAction } from "./actions";

const PREVIEW_CONTEXT = {
  patient_name: "Jane Dela Cruz",
  clinic_name: "Main Clinic",
  practitioner_name: "Dr. Santos",
  service_name: "General Consultation",
  appointment_date: "June 15, 2026",
  appointment_time: "2:00 PM",
  clinic_address: "123 Rizal St, Davao City",
};

export function TemplateEditor({ template }: { template: ReminderTemplateRow }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSubject(template.subject ?? "");
      setBody(template.body);
      setEnabled(template.enabled);
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateReminderTemplateAction(template.id, { subject, body, enabled });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Template saved.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{template.name}</DialogTitle>
            <DialogDescription>{template.channel} template</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-enabled">Enabled</Label>
              <Switch id="tpl-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {template.channel === "email" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="tpl-subject">Subject</Label>
                <Input
                  id="tpl-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="tpl-body">Message</Label>
              <Textarea
                id="tpl-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Supported variables: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(", ")}
              </p>
            </div>

            <Separator />

            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Preview</p>
              <div className="rounded-lg border p-3 text-sm">
                {subject && (
                  <p className="mb-1 font-medium">{renderTemplate(subject, PREVIEW_CONTEXT)}</p>
                )}
                <p className="whitespace-pre-wrap">{renderTemplate(body, PREVIEW_CONTEXT)}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
