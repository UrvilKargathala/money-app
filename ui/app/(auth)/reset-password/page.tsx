"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resetAction } from "./actions";
import { Suspense } from "react";

function ResetForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [state, formAction, isPending] = useActionState(resetAction, null);

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.success && (
            <Alert variant="success">
              <AlertDescription>
                Password reset successful. <Link href="/login" className="underline font-medium">Sign in</Link>
              </AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="token_display">Reset token</Label>
            <Input id="token_display" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token from email" required />
            <p className="text-xs text-neutral-400">Auto-filled from email link. You can paste manually if needed.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input id="new_password" name="new_password" type="password" placeholder="••••••••" autoComplete="new-password" required error={!!state?.fieldErrors?.new_password} />
            {state?.fieldErrors?.new_password && <p className="text-xs text-error-dark">{state.fieldErrors.new_password}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" placeholder="••••••••" autoComplete="new-password" required error={!!state?.fieldErrors?.confirm} />
            {state?.fieldErrors?.confirm && <p className="text-xs text-error-dark">{state.fieldErrors.confirm}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Resetting..." : "Reset password"}
          </Button>
          <p className="text-center text-sm text-neutral-500">
            <Link href="/login" className="font-medium text-primary-600 hover:underline">Back to sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Card><CardContent><p className="text-sm text-neutral-500">Loading...</p></CardContent></Card>}>
      <ResetForm />
    </Suspense>
  );
}
