"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const plans = [
  { name: "Starter", price: "₹0", cycle: "Free", description: "Build your everyday money habits.", note: "The essentials, at no cost." },
  { name: "Growth", price: "₹149", cycle: "/ month", description: "Room to grow, month by month.", note: "Billed monthly. Cancel anytime." },
  { name: "Wealth", price: "₹999", cycle: "/ year", description: "A full year of financial clarity.", note: "About ₹83/month, billed annually." },
  { name: "Legacy", price: "₹2,999", cycle: "one time", description: "Be part of the beginning.", note: "Founding price for the first 1,000 members." },
];
const starter = ["2 accounts · unlimited transactions", "2 budget categories", "5 bill reminders", "3 tracked subscriptions · no audits", "1 active goal", "In-app notifications · single-device access", "Manual per-module CSV exports"];
const premium = ["Unlimited accounts, budgets, bills, subscriptions & goals", "Subscription audits", "Investments, SIPs & portfolio analytics", "Debt payoff strategies & tax tools", "Advanced widgets, reports & forecasts", "Full CSV/PDF Export Center", "Email alerts & multi-device sync"];
export function PricingPlans() {
  const [selected, setSelected] = useState("Wealth");
  return <div className="mx-auto max-w-6xl">
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => <Card key={plan.name} className={`relative flex flex-col rounded-2xl border bg-surface ${selected === plan.name ? "border-indigo-600 ring-2 ring-indigo-600 shadow-lg shadow-indigo-100" : plan.name === "Legacy" ? "border-amber-300" : "border-stone-200 dark:border-[#2A2A2A]"}`}>
        {plan.name === "Wealth" && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-bold text-white">BEST VALUE</div>}
        <CardHeader className="pb-4 pt-8"><p className={`text-sm font-bold uppercase tracking-widest ${plan.name === "Legacy" ? "text-amber-700" : "text-indigo-600"}`}>{plan.name}</p><p className="min-h-12 text-sm leading-relaxed text-stone-600">{plan.description}</p><p className="pt-3"><span className="pricing-number text-3xl font-bold tracking-tight">{plan.price}</span><span className="ml-2 text-sm text-stone-500">{plan.cycle}</span></p><p className="min-h-12 text-sm text-stone-600">{plan.note}</p></CardHeader>
        <CardContent className="flex flex-1 flex-col"><Button className={`mb-6 w-full ${selected === plan.name ? "bg-indigo-600 hover:bg-indigo-700" : "border border-line bg-surface text-ink-1 hover:bg-sunken"}`} aria-pressed={selected === plan.name} onClick={() => setSelected(plan.name)}>{selected === plan.name ? "Selected" : `Choose ${plan.name}`}<ArrowRight className="ml-2 h-4 w-4" /></Button><p className="mb-4 text-sm font-semibold">{plan.name === "Starter" ? "A strong start" : "Everything in Premium"}</p><ul className="space-y-3 text-sm leading-relaxed text-stone-700 dark:text-[#B9C7DE]">{(plan.name === "Starter" ? starter : premium).map((item) => <li key={item} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-indigo-600" /><span>{item}</span></li>)}</ul>{plan.name === "Legacy" && <p className="mt-5 text-sm text-amber-800">Limited founding offer. Future pricing will rise; features are identical across paid plans.</p>}</CardContent>
      </Card>)}
    </div>
    <div className="mt-8 rounded-2xl border border-stone-200 bg-surface p-6 text-center" aria-live="polite"><p className="font-semibold">{selected === "Starter" ? "Start building better money habits." : `${selected} selected - paid checkout is not available yet.`}</p><p className="mt-2 text-sm text-stone-600">{selected === "Starter" ? "Create your free account to get started." : "No payment has been taken and your current plan has not changed."}</p>{selected === "Starter" && <Button asChild className="mt-4 bg-indigo-600 hover:bg-indigo-700"><Link href="/signup">Create free account</Link></Button>}</div>
    <p className="mt-5 text-center text-sm text-stone-600">Growth, Wealth, and Legacy have identical features and access. Dark theme will be included when released.</p>
  </div>;
}
