"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createBillingCheckout } from "@/lib/billing-client";

export function Paywall({ feature, plan, trialDaysLeft }: { feature: string; plan?: string; trialDaysLeft?: number | null }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function checkout(p: "monthly" | "annual" | "lifetime") {
    setLoading(p);
    const res = await createBillingCheckout(p);
    if (res?.url) {
      window.location.href = res.url;
    } else {
      toast.error("Checkout unavailable. Stripe not configured.");
      setLoading(null);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Lock className="h-5 w-5" /> {feature} — Premium
        </CardTitle>
        <CardDescription className="text-amber-800">
          {plan === "free" ? "Free plan: this feature is locked." : "This feature requires a paid plan."}
          {trialDaysLeft != null && trialDaysLeft > 0 ? ` Trial ends in ${trialDaysLeft} days.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-amber-900 mb-4">Upgrade to Monthly ₹300, Annual ₹2400/yr (₹200/mo), or Lifetime ₹3500 one-time.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => checkout("monthly")} disabled={!!loading} variant="default">
            <Sparkles className="h-4 w-4 mr-1" /> Monthly ₹300
          </Button>
          <Button onClick={() => checkout("annual")} disabled={!!loading} variant="secondary">Annual ₹2400</Button>
          <Button onClick={() => checkout("lifetime")} disabled={!!loading} variant="outline">Lifetime ₹3500</Button>
        </div>
        {loading && <p className="text-xs text-neutral-500 mt-2">Redirecting to checkout…</p>}
      </CardContent>
    </Card>
  );
}

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  if (daysLeft <= 0) return null;
  return (
    <div className="mb-4 rounded-lg bg-teal-50 border border-teal-200 p-3 text-sm text-teal-900">
      Trial: {daysLeft} day{daysLeft === 1 ? "" : "s"} left — full access. Upgrading keeps all data.
    </div>
  );
}
