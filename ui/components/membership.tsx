"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Plan = { plan_type: "free" | "premium"; billing_cycle: "monthly" | "annual" | "lifetime" | null };
const MembershipContext = createContext<{ premium: boolean; loading: boolean; plan: Plan | null }>({ premium: false, loading: true, plan: null });
export const useMembership = () => useContext(MembershipContext);

export function UpgradeCard({ feature = "Premium features" }: { feature?: string }) {
  return <Card className="border-indigo-200 bg-indigo-50/40"><CardHeader className="pb-4"><CardTitle>{feature}</CardTitle></CardHeader><CardContent className="space-y-4"><p>Available with Growth, Wealth, or Legacy. Every paid plan includes the same features.</p><Button asChild className="bg-indigo-600 hover:bg-indigo-700"><Link href="/pricing">Compare plans</Link></Button></CardContent></Card>;
}

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Once per session: plan tier never changes mid-click, so refetching on
  // every navigation only multiplied /users/me/plan traffic. Billing flows
  // remount the provider tree on success, which re-runs this fetch.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/users/me/plan", { signal: controller.signal }).then(async (r) => {
      if (!r.ok) throw new Error("Plan unavailable");
      const data = await r.json();
      setPlan(data.plan); setError(false); setLoading(false);
    }).catch((e) => { if (e.name !== "AbortError") { setError(true); setLoading(false); } });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const premium = true; // Plans are informational until billing is enabled.
  const premiumPage = ["/wealth/investments", "/wealth/debts", "/planning/tax", "/planning/export"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return <MembershipContext.Provider value={{ premium, loading, plan }}>
    {children}
  </MembershipContext.Provider>;
}
