import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { apiFetchRaw } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session";
import { redirect } from "next/navigation";

async function verifyToken(token: string) {
  try {
    const res = await apiFetchRaw(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, { method: "GET" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || "Link expired or invalid." };
    const t: string | undefined = body.token;
    const maxAge: number = body.maxAge ?? 30 * 24 * 60 * 60;
    if (t) await setSessionCookie(t, maxAge);
    return { success: true };
  } catch {
    return { error: "Something went wrong." };
  }
}

export default async function MagicLinkVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Magic link</CardTitle>
          <CardDescription>Missing token</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive"><AlertDescription>Missing token. Check your email link.</AlertDescription></Alert>
          <Button asChild className="mt-4 w-full"><Link href="/magic-link">Request new link</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const result = await verifyToken(token);
  if (result.success) {
    redirect("/dashboard");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Magic link</CardTitle>
        <CardDescription>Verification failed</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive"><AlertDescription>{result.error}</AlertDescription></Alert>
        <Button asChild className="w-full"><Link href="/magic-link">Request new link</Link></Button>
        <p className="text-center text-sm text-neutral-500"><Link href="/login" className="font-medium text-primary-600 hover:underline">Back to sign in</Link></p>
      </CardContent>
    </Card>
  );
}
