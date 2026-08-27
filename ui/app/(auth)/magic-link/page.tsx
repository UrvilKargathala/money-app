"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { magicLinkAction } from "./actions";

export default function MagicLinkPage() {
  const [state, formAction, isPending] = useActionState(magicLinkAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Magic link sign-in</CardTitle>
        <CardDescription>We&apos;ll email you a one-time login link (15 min expiry).</CardDescription>
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
              <AlertDescription>If an account exists, a login link has been sent. Check your inbox.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required error={!!state?.fieldErrors?.email} />
            {state?.fieldErrors?.email && <p className="text-xs text-error-dark">{state.fieldErrors.email}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Sending..." : "Send magic link"}
          </Button>
          <p className="text-center text-sm text-neutral-500">
            Prefer password? <Link href="/login" className="font-medium text-primary-600 hover:underline">Sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
