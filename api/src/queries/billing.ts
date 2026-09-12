import type { PoolClient } from "pg";
import { query } from "../db";

export type Queryable = { query: typeof query } | PoolClient;

export async function findActiveSubscription(userId: number, q: Queryable) {
  const exec = (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);
  const r = await exec<{ provider_subscription_id: string | null; status: string }>(
    `SELECT provider_subscription_id, status FROM user_plan_subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due') LIMIT 1`,
    [userId]
  );
  return r.rows[0] ?? null;
}

export async function markCancelAtPeriodEnd(userId: number, q: Queryable) {
  const exec = (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);
  await exec(`UPDATE user_plan_subscriptions SET cancel_at_period_end = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND status IN ('active','trialing','past_due')`, [userId]);
}

export async function upsertSubscriptionFromCheckout(
  q: PoolClient,
  params: { userId: number; planCode: string; customerId: string | null; subscriptionId: string | null }
) {
  const priceRes = await q.query<{ id: string }>(`SELECT id FROM plan_prices WHERE plan_code = $1 AND is_current = 1 LIMIT 1`, [params.planCode]);
  const priceId = priceRes.rows[0]?.id ?? null;
  await q.query(
    `INSERT INTO user_plan_subscriptions (user_id, plan_code, status, provider, provider_customer_id, provider_subscription_id, price_id, current_period_end)
     VALUES ($1,$2,'active','stripe',$3,$4,$5::uuid, CURRENT_TIMESTAMP + INTERVAL '30 days')
     ON CONFLICT DO NOTHING`,
    [params.userId, params.planCode, params.customerId, params.subscriptionId, priceId]
  );
  await q.query(
    `UPDATE user_plan_subscriptions SET plan_code=$2, status='active', provider='stripe', provider_customer_id=COALESCE($3, provider_customer_id), provider_subscription_id=COALESCE($4, provider_subscription_id), price_id=COALESCE($5::uuid, price_id), updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND status IN ('active','trialing','past_due','cancelled')`,
    [params.userId, params.planCode, params.customerId, params.subscriptionId, priceId]
  );
  await q.query(`UPDATE user_settings SET plan_code=$2, updated_at=CURRENT_TIMESTAMP WHERE user_id=$1`, [params.userId, params.planCode]);
  await q.query(`INSERT INTO plan_change_history (user_id, to_plan, to_price_id, reason) VALUES ($1,$2,$3::uuid,'webhook')`, [params.userId, params.planCode, priceId]);
}

export async function trimSessionsToNewest(q: PoolClient, userId: number): Promise<number> {
  // Downgrade trim: free plan allows a single active session — keep the newest,
  // revoke everything else. Runs inside the caller's transaction (same txn as
  // the plan flip) so the two can never diverge.
  const r = await q.query(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL
     AND token_id NOT IN (
       SELECT token_id FROM auth_tokens
       WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL
       ORDER BY created_at DESC, token_id DESC LIMIT 1
     )`,
    [userId]
  );
  return r.rowCount ?? 0;
}

export async function handleSubscriptionUpdate(q: PoolClient, params: { userId: number; subscriptionId: string; status?: string; cancelAtPeriodEnd?: boolean; currentPeriodEnd?: number }) {
  if (params.status === "canceled") {
    await q.query(`UPDATE user_plan_subscriptions SET status='cancelled', canceled_at=CURRENT_TIMESTAMP, cancel_at_period_end=0, updated_at=CURRENT_TIMESTAMP WHERE user_id = $1 AND provider_subscription_id=$2`, [params.userId, params.subscriptionId]);
    await q.query(`UPDATE user_settings SET plan_code='free', updated_at=CURRENT_TIMESTAMP WHERE user_id=$1`, [params.userId]);
    await trimSessionsToNewest(q, params.userId);
  } else if (params.cancelAtPeriodEnd) {
    await q.query(`UPDATE user_plan_subscriptions SET cancel_at_period_end=1, current_period_end=to_timestamp($3), updated_at=CURRENT_TIMESTAMP WHERE user_id = $1 AND provider_subscription_id=$2`, [params.userId, params.subscriptionId, params.currentPeriodEnd ?? null]);
  }
}

export async function findUserByCustomerId(customerId: string) {
  const r = await query<{ user_id: number }>(`SELECT user_id FROM user_plan_subscriptions WHERE provider_customer_id = $1 LIMIT 1`, [customerId]);
  return r.rows[0]?.user_id ?? null;
}

export async function insertBillingEvent(userId: number, eventId: string, eventType: string, payload: string) {
  await query(`INSERT INTO billing_events (user_id, provider, event_id, type, payload) VALUES ($1,'stripe',$2,$3,$4::jsonb) ON CONFLICT (event_id) DO NOTHING`, [userId, eventId, eventType, payload]);
}
