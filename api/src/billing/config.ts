/**
 * Billing config — single-read principle.
 * All Stripe env wiring is read here and nowhere else, so rotating a key
 * or swapping test<->live Price IDs is a single .env change (no code).
 * Mirrors the email.ts pattern: Resend lazy-import + dev stub vs prod fail-loud.
 */

export type BillingConfig = {
  provider: "stripe";
  secretKey: string | null;
  webhookSecret: string | null;
  priceMonthly: string | null;
  priceAnnual: string | null;
  priceLifetime: string | null;
  appUrl: string;
};

export function getBillingConfig(): BillingConfig {
  return {
    provider: "stripe",
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    priceMonthly: process.env.STRIPE_PRICE_MONTHLY?.trim() || null,
    priceAnnual: process.env.STRIPE_PRICE_ANNUAL?.trim() || null,
    priceLifetime: process.env.STRIPE_PRICE_LIFETIME?.trim() || null,
    appUrl: process.env.APP_URL?.trim() || "http://localhost:3000",
  };
}

let stripeInstance: Stripe | null = null;
type Stripe = import("stripe").default;

export async function getStripe(): Promise<Stripe | null> {
  const cfg = getBillingConfig();
  if (!cfg.secretKey) return null;
  if (stripeInstance) return stripeInstance;
  const mod = await import("stripe");
  const StripeCtor = mod.default as unknown as new (
    key: string,
    opts: { apiVersion: string }
  ) => Stripe;
  stripeInstance = new StripeCtor(cfg.secretKey, {
    apiVersion: "2024-11-20.acacia",
  });
  return stripeInstance;
}

export function isBillingConfigured(): boolean {
  return getBillingConfig().secretKey !== null;
}

export function requireStripePrice(plan: "monthly" | "annual" | "lifetime"): string | null {
  const cfg = getBillingConfig();
  if (plan === "monthly") return cfg.priceMonthly;
  if (plan === "annual") return cfg.priceAnnual;
  return cfg.priceLifetime;
}
