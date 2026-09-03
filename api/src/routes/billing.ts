import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { withUser } from "../db";
import { getBillingProfile } from "../queries/entitlements";
import { getBillingConfig, getStripe, requireStripePrice } from "../billing/config";
import { findActiveSubscription, markCancelAtPeriodEnd, upsertSubscriptionFromCheckout, handleSubscriptionUpdate, findUserByCustomerId, insertBillingEvent } from "../queries/billing";

export const billing = new Hono();
export const billingProfile = new Hono();

billing.get("/plans", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await getBillingProfile(user.user_id);
  return c.json({ plans: profile.plans, current: profile.plan.code });
});

billingProfile.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const m = Number(c.req.query("month") ?? String(new Date().getMonth() + 1));
  const y = Number(c.req.query("year") ?? String(new Date().getFullYear()));
  const opts = Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y >= 2000 && y <= 2100 ? { month: m, year: y } : {};
  const profile = await getBillingProfile(user.user_id, opts);
  return c.json(profile);
});

billing.post("/checkout", requireAuth, async (c) => {
  const user = c.get("user");
  let body: { plan?: string } = {};
  try {
    body = (await c.req.json()) as { plan?: string };
  } catch {
    body = {};
  }
  const plan = String(body.plan ?? "").trim() as "monthly" | "annual" | "lifetime";
  if (!["monthly", "annual", "lifetime"].includes(plan)) {
    return c.json({ error: "Invalid plan." }, 400);
  }
  const stripe = await getStripe();
  if (!stripe) {
    return c.json({ error: "billing_unconfigured", message: "Stripe is not configured." }, 503);
  }
  const priceId = requireStripePrice(plan);
  if (!priceId) {
    return c.json({ error: "price_not_configured", message: `No Stripe price for ${plan}.` }, 503);
  }
  const cfg = getBillingConfig();
  const mode = plan === "lifetime" ? "payment" : "subscription";
  const session = await (stripe.checkout.sessions.create as unknown as (p: Record<string, unknown>) => Promise<{ url: string | null; id: string }>)({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${cfg.appUrl}/settings?billing=success`,
    cancel_url: `${cfg.appUrl}/settings?billing=cancel`,
    client_reference_id: String(user.user_id),
    metadata: { user_id: String(user.user_id), plan },
    customer_email: (c.get("user") as { email?: string }).email,
  });
  return c.json({ url: session.url, id: session.id });
});

billing.post("/cancel", requireAuth, async (c) => {
  const user = c.get("user");
  const stripe = await getStripe();
  // Even without stripe, allow local cancel for manual plans
  const result = await withUser(user.user_id, async (client) => {
    const row = await findActiveSubscription(user.user_id, client);
    if (!row) return { found: false as const };
    if (row.provider_subscription_id && stripe) {
      try {
        await stripe.subscriptions.update(row.provider_subscription_id, { cancel_at_period_end: true });
      } catch (e) {
        // fall through to local flag
        console.warn("[billing] stripe cancel failed", e);
      }
    }
    await markCancelAtPeriodEnd(user.user_id, client);
    return { found: true as const };
  });
  if (!result.found) return c.json({ error: "No active subscription." }, 404);
  return c.json({ success: true });
});

billing.post("/webhook", async (c) => {
  const cfg = getBillingConfig();
  if (!cfg.webhookSecret) {
    return c.json({ error: "webhook_not_configured" }, 503);
  }
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing stripe-signature." }, 400);
  const raw = await c.req.text();
  const stripe = await getStripe();
  if (!stripe) return c.json({ error: "billing_unconfigured" }, 503);
  let event: { id: string; type: string; data: { object: unknown } };
  try {
    event = stripe.webhooks.constructEvent(raw, sig, cfg.webhookSecret) as unknown as typeof event;
  } catch (e) {
    return c.json({ error: "Invalid signature." }, 400);
  }

  // Idempotency: billing_events.event_id UNIQUE
  // We need user_id to insert; extract from event
  const obj = event.data.object as Record<string, unknown>;
  const userIdFromMeta = Number(
    ((obj.metadata as Record<string, unknown> | undefined)?.user_id as string | undefined) ??
      ((obj.client_reference_id as string | undefined) ?? "")
  );
  const customerId = (obj.customer as string | undefined) ?? null;
  const subscriptionId = ((obj.subscription as string | undefined) ?? (obj.id as string | undefined) ?? null) as string | null;

  // Try to resolve user_id via metadata or customer lookup
  let userId = Number.isFinite(userIdFromMeta) && userIdFromMeta > 0 ? userIdFromMeta : null;
  if (!userId && customerId) {
    const found = await findUserByCustomerId(customerId);
    if (found) userId = found;
  }
  // inserts still need user_id; if not found, log and ack to avoid Stripe retries loop
  if (!userId) {
    console.warn("[billing] webhook without user_id", event.type, event.id);
    return c.json({ received: true, note: "no user resolved" });
  }

  try {
    await insertBillingEvent(userId, event.id, event.type, JSON.stringify(obj));
  } catch {
    // ignore duplicate
  }

  // Minimal state transitions; full price pinning can be added later
  if (event.type === "checkout.session.completed") {
    const sess = obj as { metadata?: { plan?: string }; customer?: string; subscription?: string; payment_status?: string };
    const plan = (sess.metadata?.plan as string) ?? "monthly";
    const priceLookup: Record<string, string> = { monthly: "monthly", annual: "annual", lifetime: "lifetime" };
    const planCode = priceLookup[plan] ?? "monthly";
    await withUser(userId, async (client) => {
      await upsertSubscriptionFromCheckout(client, { userId, planCode, customerId, subscriptionId });
    });
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = obj as { id?: string; status?: string; cancel_at_period_end?: boolean; current_period_end?: number; customer?: string };
    if (sub.id) {
      await withUser(userId, async (client) => {
        await handleSubscriptionUpdate(client, { userId, subscriptionId: sub.id as string, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end, currentPeriodEnd: sub.current_period_end });
      });
    }
  }

  return c.json({ received: true });
});
