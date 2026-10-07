import { query } from "../db";
import type { PoolClient } from "pg";

export type Queryable = { query: typeof query } | PoolClient;

const DB = { query };

export type PlanCode = "free" | "monthly" | "annual" | "lifetime";

export const PLAN_LIMITS = {
  free: {
    accounts: 2,
    budgets: 2,
    bill_reminders: 5,
    tracker_subscriptions: 3,
    goals_active: 1,
  },
} as const;

export type FeatureKey =
  | "accounts"
  | "budgets"
  | "bill_reminders"
  | "tracker_subscriptions"
  | "goals_active"
  | "investments"
  | "debts"
  | "tax"
  | "reports_widgets"
  | "export_batch"
  | "notifications_email"
  | "cross_device_sync"
  | "subscription_audits"
  | "scan_jobs";

type EntitlementRow = {
  plan_code: string;
  feature_key: string;
  allowed: number;
  limit_value: string | null;
  mode: string | null;
};

export type BillingProfile = {
  plan: { code: PlanCode; name: string; interval: string };
  status: string;
  source: "paid" | "trial" | "free";
  trial: { active: boolean; endsAt: string | null; daysLeft: number };
  period: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
  price: { amountInr: number; perText: string; stripePriceId: string | null };
  entitlements: Record<string, { allowed: boolean; limit: number | null; used: number | null; mode: string | null }>;
  plans: { code: string; name: string; priceInr: number; perText: string; interval: string; stripePriceId: string | null }[];
  locks: Record<string, { unlocked: string[]; locked: string[] }>;
};

async function resolveEffectivePlanFresh(userId: number, q: Queryable = DB): Promise<{ code: PlanCode; source: "paid" | "trial" | "free"; subRow: { plan_code: string; status: string; current_period_end: Date | null; cancel_at_period_end: number; trial_ends_at: Date | null } | null; userCreatedAt: Date }> {
  const exec = (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);

  const userRes = await exec<{ created_at: Date; plan_type: string | null }>(
    `SELECT created_at, plan_type FROM users WHERE user_id = $1`,
    [userId]
  );
  const createdAt = userRes.rows[0]?.created_at ?? new Date();
  const legacyPlan = userRes.rows[0]?.plan_type ?? null;
  const subRes = await exec<{ plan_code: string; status: string; current_period_end: Date | null; cancel_at_period_end: number; trial_ends_at: Date | null }>(
    `SELECT plan_code, status, current_period_end, cancel_at_period_end, trial_ends_at FROM user_plan_subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due') LIMIT 1`,
    [userId]
  );
  const sub = subRes.rows[0] ?? null;
  if (sub) {
    return { code: sub.plan_code as PlanCode, source: "paid", subRow: sub, userCreatedAt: createdAt };
  }
  // Static-demo grant path (no Stripe): the legacy premium flag predates the
  // subscription system and seeded demo accounts carry it. Honor it so demo
  // users are not downgraded to free once their trial lapses. Annual is the
  // display code; paid-tier entitlements are identical across tiers.
  if (legacyPlan === "premium") {
    return { code: "annual", source: "paid", subRow: null, userCreatedAt: createdAt };
  }
  const trialEnds = new Date(createdAt);
  trialEnds.setDate(trialEnds.getDate() + 30);
  if (new Date() < trialEnds) {
    return { code: "monthly", source: "trial", subRow: null, userCreatedAt: createdAt };
  }
  // cache in user_settings.plan_code if present, else free
  const settingsRes = await exec<{ plan_code: string }>(`SELECT plan_code FROM user_settings WHERE user_id = $1`, [userId]);
  const cached = (settingsRes.rows[0]?.plan_code as PlanCode | undefined) ?? "free";
  return { code: cached, source: "free", subRow: null, userCreatedAt: createdAt };
}

export async function getEffectivePlan(userId: number, q: Queryable = DB): Promise<{ code: PlanCode; source: "paid" | "trial" | "free" }> {
  const r = await resolveEffectivePlan(userId, q);
  return { code: r.code, source: r.source };
}

/**
 * Read caches: plan resolution (30s/user) + billing catalog (5min
 * process-wide). Only the default pool path is cached - explicit Queryable
 * callers (transactions) always read fresh. Webhook mutations call
 * invalidatePlanCache(); everything else self-heals via TTL.
 */
type ResolvedPlan = Awaited<ReturnType<typeof resolveEffectivePlanFresh>>;
const PLAN_TTL_MS = 30_000;
const planCache = new Map<number, { at: number; value: ResolvedPlan }>();

export function invalidatePlanCache(userId?: number): void {
  if (userId === undefined) planCache.clear();
  else planCache.delete(userId);
}

async function resolveEffectivePlan(userId: number, q: Queryable = DB): Promise<ResolvedPlan> {
  if (q !== DB) return resolveEffectivePlanFresh(userId, q);
  const hit = planCache.get(userId);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return hit.value;
  const value = await resolveEffectivePlanFresh(userId, q);
  planCache.set(userId, { at: Date.now(), value });
  if (planCache.size > 5000) planCache.clear();
  return value;
}

type CatalogSnapshot = {
  tiers: { code: string; name: string }[];
  prices: { plan_code: string; price_inr: string; per_text: string; interval: string; stripe_price_id: string | null }[];
  entitlements: EntitlementRow[];
};
const CATALOG_TTL_MS = 5 * 60_000;
let catalogCache: { at: number; value: CatalogSnapshot } | null = null;

export function invalidateCatalogCache(): void {
  catalogCache = null;
}

async function getCatalog(): Promise<CatalogSnapshot> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.value;
  const [tiers, prices, entitlements] = await Promise.all([
    query<{ code: string; name: string }>(`SELECT code, name FROM plan_tiers ORDER BY sort_order`),
    query<{ plan_code: string; price_inr: string; per_text: string; interval: string; stripe_price_id: string | null }>(
      `SELECT plan_code, price_inr::text AS price_inr, per_text, interval, stripe_price_id FROM plan_prices WHERE is_current = 1`
    ),
    query<EntitlementRow>(`SELECT plan_code, feature_key, allowed, limit_value, mode FROM plan_entitlements`),
  ]);
  const value: CatalogSnapshot = { tiers: tiers.rows, prices: prices.rows, entitlements: entitlements.rows };
  catalogCache = { at: Date.now(), value };
  return value;
}

export async function getEntitlement(userId: number, feature: FeatureKey, q: Queryable = DB): Promise<{ allowed: boolean; limit: number | null; mode: string | null; plan: PlanCode }> {
  const { code } = await resolveEffectivePlan(userId, q);
  const rows =
    q === DB
      ? (await getCatalog()).entitlements.filter((r) => r.plan_code === code)
      : (
          await (q as { query: typeof query }).query<EntitlementRow>(
            `SELECT plan_code, feature_key, allowed, limit_value, mode FROM plan_entitlements WHERE plan_code = $1 AND feature_key = $2`,
            [code, feature]
          )
        ).rows;
  const row = rows.find((r) => r.feature_key === feature);
  if (!row) return { allowed: false, limit: null, mode: null, plan: code };
  return {
    allowed: row.allowed === 1,
    limit: row.limit_value != null ? Number(row.limit_value) : null,
    mode: row.mode,
    plan: code,
  };
}

/**
 * Single source of truth for email-notification access. Every reader and
 * writer of notification preferences must go through this — never a legacy
 * `users.plan_type` check — so the displayed state and the enforced gate
 * cannot disagree (that disagreement surfaced as toggles that "revert").
 */
export async function isEmailEntitled(userId: number, q: Queryable = DB): Promise<boolean> {
  const ent = await getEntitlement(userId, "notifications_email", q);
  return ent.allowed && ent.mode === "in_app_email";
}

export async function requireEntitlement(userId: number, feature: FeatureKey, q: Queryable = DB): Promise<{ plan: PlanCode }> {
  const ent = await getEntitlement(userId, feature, q);
  if (!ent.allowed) {
    const err = new Error("PLAN_LIMIT") as Error & { feature?: string; plan?: string };
    err.feature = feature;
    err.plan = ent.plan;
    throw err;
  }
  return { plan: ent.plan };
}

export async function countForFeature(userId: number, feature: FeatureKey, opts: { month?: number; year?: number } = {}, q: Queryable = DB): Promise<number> {
  const exec = (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);
  if (feature === "accounts") {
    const r = await exec<{ n: string }>(`SELECT COUNT(*)::text AS n FROM accounts WHERE user_id = $1 AND is_active = 1 AND deleted_at IS NULL`, [userId]);
    return Number(r.rows[0]?.n ?? 0);
  }
  if (feature === "budgets") {
    const month = opts.month ?? new Date().getMonth() + 1;
    const year = opts.year ?? new Date().getFullYear();
    const r = await exec<{ n: string }>(`SELECT COUNT(*)::text AS n FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3`, [userId, month, year]);
    return Number(r.rows[0]?.n ?? 0);
  }
  if (feature === "bill_reminders") {
    const r = await exec<{ n: string }>(`SELECT COUNT(*)::text AS n FROM bill_reminders WHERE user_id = $1 AND is_active = 1`, [userId]);
    return Number(r.rows[0]?.n ?? 0);
  }
  if (feature === "tracker_subscriptions") {
    const r = await exec<{ n: string }>(`SELECT COUNT(*)::text AS n FROM subscriptions WHERE user_id = $1 AND status <> 'cancelled'`, [userId]);
    return Number(r.rows[0]?.n ?? 0);
  }
  if (feature === "goals_active") {
    const r = await exec<{ n: string }>(`SELECT COUNT(*)::text AS n FROM goals WHERE user_id = $1 AND status = 'active'`, [userId]);
    return Number(r.rows[0]?.n ?? 0);
  }
  return 0;
}

export async function checkCountLimit(userId: number, feature: FeatureKey, opts: { month?: number; year?: number } = {}, q: Queryable = DB): Promise<{ plan: PlanCode; limit: number | null; used: number } | null> {
  const ent = await getEntitlement(userId, feature, q);
  if (ent.limit == null) return null;
  const used = await countForFeature(userId, feature, opts, q);
  if (used >= ent.limit) {
    return { plan: ent.plan, limit: ent.limit, used };
  }
  return null;
}

export async function getUnlockedIds(userId: number, feature: FeatureKey, opts: { month?: number; year?: number } = {}, q: Queryable = DB): Promise<Set<string>> {
  const ent = await getEntitlement(userId, feature, q);
  if (ent.limit == null || !ent.allowed) return new Set();
  // unlimited -> everything unlocked (empty set means no lock, caller treats as all unlocked)
  // But to compute locks we need actual ids: we return unlocked ids = newest N
  const limit = ent.limit;
  const exec = (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);
  let sql = "";
  let params: unknown[] = [];
  if (feature === "accounts") {
    sql = `SELECT id::text AS id FROM accounts WHERE user_id = $1 AND is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT $2`;
    params = [userId, limit];
  } else if (feature === "budgets") {
    const month = opts.month ?? new Date().getMonth() + 1;
    const year = opts.year ?? new Date().getFullYear();
    sql = `SELECT id::text AS id FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3 ORDER BY created_at DESC, id DESC LIMIT $4`;
    params = [userId, month, year, limit];
  } else if (feature === "bill_reminders") {
    sql = `SELECT id::text AS id FROM bill_reminders WHERE user_id = $1 AND is_active = 1 ORDER BY created_at DESC, id DESC LIMIT $2`;
    params = [userId, limit];
  } else if (feature === "tracker_subscriptions") {
    sql = `SELECT id::text AS id FROM subscriptions WHERE user_id = $1 AND status <> 'cancelled' ORDER BY created_at DESC, id DESC LIMIT $2`;
    params = [userId, limit];
  } else if (feature === "goals_active") {
    sql = `SELECT id::text AS id FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC, id DESC LIMIT $2`;
    params = [userId, limit];
  } else {
    return new Set();
  }
  const res = await exec<{ id: string }>(sql, params);
  return new Set(res.rows.map((r) => r.id));
}

export async function isRowLocked(userId: number, feature: FeatureKey, rowId: string, opts: { month?: number; year?: number } = {}, q: Queryable = DB): Promise<{ locked: boolean; plan: PlanCode; limit: number | null }> {
  const ent = await getEntitlement(userId, feature, q);
  if (ent.limit == null || !ent.allowed) return { locked: false, plan: ent.plan, limit: ent.limit };
  const used = await countForFeature(userId, feature, opts, q);
  if (used <= ent.limit) return { locked: false, plan: ent.plan, limit: ent.limit };
  const unlocked = await getUnlockedIds(userId, feature, opts, q);
  return { locked: !unlocked.has(rowId), plan: ent.plan, limit: ent.limit };
}

export async function assertRowUnlocked(userId: number, feature: FeatureKey, rowId: string, opts: { month?: number; year?: number } = {}, q: Queryable = DB): Promise<void> {
  const { locked, plan } = await isRowLocked(userId, feature, rowId, opts, q);
  if (locked) {
    const err = new Error("PLAN_LOCKED") as Error & { feature?: string; plan?: string };
    err.feature = feature;
    err.plan = plan;
    throw err;
  }
}

export async function listBudgetIdsForMonth(userId: number, month: number, year: number, q: Queryable = DB): Promise<string[]> {
  const exec = (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);
  const res = await exec<{ id: string }>(`SELECT id::text AS id FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3 ORDER BY created_at DESC, id DESC`, [userId, month, year]);
  return res.rows.map((r) => r.id);
}

export async function enforceSingleSessionIfFree(userId: number, currentTokenHash: string): Promise<void> {
  // Data-driven: cross_device_sync.allowed decides (free denies, trial/paid allow).
  // Resolves via effective plan (paid row → trial window → cached plan_code).
  const ent = await getEntitlement(userId, "cross_device_sync", DB);
  if (ent.allowed) return;
  await query(`UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND token_hash != $2 AND token_type = 'session' AND revoked_at IS NULL`, [userId, currentTokenHash]);
}

export async function getBillingProfile(userId: number, opts: { month?: number; year?: number } = {}): Promise<BillingProfile> {
  const resolved = await resolveEffectivePlan(userId, DB);
  const catalog = await getCatalog();
  const planCode = resolved.code;

  const tierName = catalog.tiers.find((t) => t.code === planCode)?.name ?? planCode;

  // interval + price from plan_prices current row
  const priceRow = catalog.prices.find((p) => p.plan_code === planCode) ?? {
    price_inr: "0",
    per_text: "free",
    interval: "none",
    stripe_price_id: null,
  };

  const entRows = catalog.entitlements.filter((r) => r.plan_code === planCode);
  const usage = await Promise.all([
    countForFeature(userId, "accounts"),
    countForFeature(userId, "budgets", opts),
    countForFeature(userId, "bill_reminders"),
    countForFeature(userId, "tracker_subscriptions"),
    countForFeature(userId, "goals_active"),
  ]);
  const usageMap: Record<string, number> = {
    accounts: usage[0],
    budgets: usage[1],
    bill_reminders: usage[2],
    tracker_subscriptions: usage[3],
    goals_active: usage[4],
  };

  const entitlements: BillingProfile["entitlements"] = {};
  for (const r of entRows) {
    entitlements[r.feature_key] = {
      allowed: r.allowed === 1,
      limit: r.limit_value != null ? Number(r.limit_value) : null,
      used: usageMap[r.feature_key] ?? null,
      mode: r.mode,
    };
  }
  // ensure all booleans present even if no limit row
  const boolKeys: FeatureKey[] = ["investments", "debts", "tax", "reports_widgets", "cross_device_sync", "subscription_audits"];
  for (const k of boolKeys) {
    if (!entitlements[k]) {
      const row = entRows.find((x) => x.feature_key === k);
      if (row) continue;
    }
  }

  const plans = catalog.tiers.map((t) => {
    const p = catalog.prices.find((x) => x.plan_code === t.code);
    return {
      code: t.code,
      name: t.name,
      priceInr: Number(p?.price_inr ?? 0),
      perText: p?.per_text ?? "",
      interval: p?.interval ?? "none",
      stripePriceId: p?.stripe_price_id ?? null,
    };
  });

  const trialEndsAt = (() => {
    if (resolved.source === "paid") return resolved.subRow?.trial_ends_at ?? null;
    const d = new Date(resolved.userCreatedAt);
    d.setDate(d.getDate() + 30);
    return d;
  })();
  const trialActive = resolved.source === "trial";
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000)) : 0;

  // locks: unlocked newest N per feature where over-limit, else empty locked
  // (usage + locks stay live queries - only the static catalog is cached).
  const exec = query;
  const locks: BillingProfile["locks"] = {};
  const lockFeatures: FeatureKey[] = ["accounts", "budgets", "bill_reminders", "tracker_subscriptions", "goals_active"];
  for (const f of lockFeatures) {
    const ent = entRows.find((r) => r.feature_key === f);
    const limit = ent?.limit_value != null ? Number(ent.limit_value) : null;
    if (limit == null) {
      locks[f] = { unlocked: [], locked: [] };
      continue;
    }
    const used = usageMap[f] ?? 0;
    if (used <= limit) {
      locks[f] = { unlocked: [], locked: [] };
      continue;
    }
    const unlockedSet = await getUnlockedIds(userId, f, opts, DB);
    const unlocked = Array.from(unlockedSet);
    // fetch all ids to derive locked list
    let allSql = "";
    let allParams: unknown[] = [];
    if (f === "accounts") {
      allSql = `SELECT id::text AS id FROM accounts WHERE user_id = $1 AND is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`;
      allParams = [userId];
    } else if (f === "budgets") {
      const m = opts.month ?? new Date().getMonth() + 1;
      const y = opts.year ?? new Date().getFullYear();
      allSql = `SELECT id::text AS id FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3 ORDER BY created_at DESC, id DESC`;
      allParams = [userId, m, y];
    } else if (f === "bill_reminders") {
      allSql = `SELECT id::text AS id FROM bill_reminders WHERE user_id = $1 AND is_active = 1 ORDER BY created_at DESC, id DESC`;
      allParams = [userId];
    } else if (f === "tracker_subscriptions") {
      allSql = `SELECT id::text AS id FROM subscriptions WHERE user_id = $1 AND status <> 'cancelled' ORDER BY created_at DESC, id DESC`;
      allParams = [userId];
    } else if (f === "goals_active") {
      allSql = `SELECT id::text AS id FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC, id DESC`;
      allParams = [userId];
    }
    const allRes = allSql ? await exec<{ id: string }>(allSql, allParams) : { rows: [] as { id: string }[] };
    const allIds = allRes.rows.map((r) => r.id);
    const locked = allIds.filter((id) => !unlockedSet.has(id));
    locks[f] = { unlocked, locked };
  }

  return {
    plan: { code: planCode, name: tierName, interval: priceRow.interval },
    status: resolved.subRow?.status ?? (trialActive ? "trialing" : "active"),
    source: resolved.source,
    trial: { active: trialActive, endsAt: trialEndsAt ? trialEndsAt.toISOString() : null, daysLeft },
    period: { currentPeriodEnd: resolved.subRow?.current_period_end ? resolved.subRow.current_period_end.toISOString() : null, cancelAtPeriodEnd: resolved.subRow ? resolved.subRow.cancel_at_period_end === 1 : false },
    price: { amountInr: Number(priceRow.price_inr), perText: priceRow.per_text, stripePriceId: priceRow.stripe_price_id },
    entitlements,
    plans,
    locks,
  };
}
