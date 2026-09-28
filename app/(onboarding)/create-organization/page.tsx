"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { businessTypes, businessTypeLabels } from "@/lib/validation/organization.schema";
import { createOrganizationAction, type CreateOrganizationActionState } from "./actions";

const initialState: CreateOrganizationActionState = {};

export default function CreateOrganizationPage() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          Your organization is the business — it can hold one clinic or many. You&apos;ll be its
          owner, with full access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="orgName">Organization name</Label>
            <Input id="orgName" name="orgName" placeholder="ABC Dental Group" required />
            {state.fieldErrors?.orgName && (
              <p className="text-destructive text-sm">{state.fieldErrors.orgName[0]}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="businessType">Clinic type</Label>
            {/* No default: this switches specialty tools on (dental charting
                for a dental clinic), so it should be chosen, not skipped
                into "Other". */}
            <Select name="businessType" required>
              <SelectTrigger id="businessType" className="w-full">
                <SelectValue placeholder="Choose your clinic type" />
              </SelectTrigger>
              <SelectContent>
                {businessTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {businessTypeLabels[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              Turns on tools made for your kind of practice — dental clinics get tooth charting, for
              example. Each clinic you add later can have its own type.
            </p>
            {state.fieldErrors?.businessType && (
              <p className="text-destructive text-sm">{state.fieldErrors.businessType[0]}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="clinicName">First clinic name</Label>
            <Input id="clinicName" name="clinicName" placeholder="Main Branch" />
            <p className="text-muted-foreground text-sm">
              Optional — defaults to your organization name. You can add more clinics and rename
              this one later.
            </p>
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
