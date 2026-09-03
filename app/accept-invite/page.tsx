"use client";

import { useEffect, useState, useActionState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { completeInviteAction, type CompleteInviteState } from "./actions";

type SessionState = "establishing" | "ready" | "invalid";

const initialState: CompleteInviteState = {};

/**
 * GoTrue's invite link uses the implicit flow (not PKCE -- the browser that
 * opens the invite is rarely the one that sent it), so the session tokens
 * arrive in the URL fragment (#access_token=...&refresh_token=...), which is
 * never sent to any server. This page must be a Client Component: it reads
 * the fragment directly and calls setSession() on the BROWSER Supabase
 * client, which persists the session to cookies (that's what makes it
 * visible to the completeInviteAction Server Action below).
 */
/** Missing tokens are decided during render (lazy init), not via setState
 * inside the effect body -- an effect should only setState from an async
 * callback reacting to an external system, never synchronously in its own
 * body (react-hooks/set-state-in-effect). `window` is guarded because this
 * initializer also runs during this Client Component's server-rendered
 * first pass, where it does not exist. */
function readHashTokens(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export default function AcceptInvitePage() {
  const [sessionState, setSessionState] = useState<SessionState>(() =>
    typeof window === "undefined" ? "establishing" : readHashTokens() ? "establishing" : "invalid",
  );
  const [state, formAction, pending] = useActionState(completeInviteAction, initialState);

  useEffect(() => {
    const tokens = readHashTokens();
    if (!tokens) return;

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
      .then(({ error }) => {
        // Clear the tokens from the visible URL regardless of outcome.
        window.history.replaceState(null, "", window.location.pathname);
        setSessionState(error ? "invalid" : "ready");
      });
  }, []);

  if (sessionState === "establishing") {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Confirming your invite…
        </CardContent>
      </Card>
    );
  }

  if (sessionState === "invalid") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite link expired</CardTitle>
          <CardDescription>
            This invite link is invalid or has expired. Ask an admin to send you a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to CareFlow AI</CardTitle>
        <CardDescription>Set a password to finish joining your organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
            {state.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
            {state.fieldErrors?.confirmPassword && (
              <p className="text-destructive text-sm">{state.fieldErrors.confirmPassword[0]}</p>
            )}
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Joining…" : "Set password and continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
