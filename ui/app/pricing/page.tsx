import Link from "next/link";
import { PricingPlans } from "./pricing-plans";
import "./pricing.css";

export const metadata = { title: "Plans & Pricing | MoneyMind" };
export default function PricingPage() {
  return <main className="pricing-page min-h-screen px-5 py-8 sm:px-10">
    <nav className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/overview/dashboard" className="text-xl font-extrabold tracking-tight">MoneyMind<span className="text-indigo-600">.</span></Link><Link href="/settings" className="text-sm text-indigo-700 underline underline-offset-4">Back to app</Link></nav>
    <header className="mx-auto mb-12 mt-16 max-w-2xl text-center"><p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">A little clarity goes a long way</p><h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Your money. Your pace.<br /><span className="text-indigo-600">Your plan.</span></h1><p className="mt-5 text-base leading-relaxed text-stone-600">Start with the essentials, or unlock the complete MoneyMind experience. Three ways to pay. The same premium features.</p></header>
    <PricingPlans />
    <section className="mx-auto mt-14 max-w-3xl border-t border-stone-300 py-8"><h2 className="text-xl font-bold">Your data rights are always included.</h2><p className="mt-3 leading-relaxed text-stone-600">Full GDPR/DPDP data export, account deactivation with a 30-day grace period, and account restore are free on every plan.</p></section>
  </main>;
}
