"use client";

import { useActionState, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { verifyEmailAction } from "./actions";

function VerifyForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [state, formAction, isPending] = useActionState(verifyEmailAction, null);

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>Enter the token from your verification email or click the link.</CardDescription>
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
              <AlertDescription>Email verified successfully. <Link href="/login" className="underline font-medium">Sign in</Link></AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="token">Verification token</Label>
            <Input id="token" name="token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" required />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Verifying..." : "Verify email"}
          </Button>
          <p className="text-center text-sm text-neutral-500">
            Need a new link?{" "}
            <Link href="/login" className="font-medium text-primary-600 hover:underline">Back to sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Card><CardContent><p className="text-sm text-neutral-500">Loading...</p></CardContent></Card>}>
      <VerifyForm />
    </Suspense>
  );
}
