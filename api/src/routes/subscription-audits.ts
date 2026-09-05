import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth, type AppEnv } from "../middleware";
import { requirePremium } from "../entitlements";
import { detectSubscriptionAudits, type AuditableSubscription } from "../utils/subscription-audits";

export const subscriptionAudits = new Hono<AppEnv>();
subscriptionAudits.use("*", requireAuth, requirePremium);
subscriptionAudits.get("/", async (c) => {
  const userId = c.get("user").user_id;
  const audits = await withUser(userId, async (client) => {
    await client.query("SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE", [userId]);
    const result = await client.query<AuditableSubscription>("SELECT id, service_name, amount::float8, frequency, category_id, last_used_at::text FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY id", [userId]);
    const findings = detectSubscriptionAudits(result.rows);
    for (const f of findings) {
      await client.query(`INSERT INTO subscription_audits (user_id, subscription_id, audit_type, finding, recommendation, potential_savings, detection_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, detection_key) WHERE detection_key IS NOT NULL
        DO UPDATE SET finding = EXCLUDED.finding, recommendation = EXCLUDED.recommendation, potential_savings = EXCLUDED.potential_savings`,
      [userId, f.subscription_id, f.audit_type, f.finding, f.recommendation, f.potential_savings, f.detection_key]);
    }
    return (await client.query(`SELECT a.*, a.potential_savings::float8 AS potential_savings FROM subscription_audits a
      JOIN subscriptions s ON s.id = a.subscription_id AND s.user_id = a.user_id
      WHERE a.user_id = $1 AND s.status = 'active' AND (a.audit_type = 'price_change' OR a.detection_key = ANY($2::text[])) ORDER BY a.created_at DESC`, [userId, findings.map((f) => f.detection_key)])).rows;
  });
  return c.json({ audits });
});
subscriptionAudits.post("/:id/dismiss", async (c) => {
  if (!/^[0-9a-f-]{36}$/i.test(c.req.param("id"))) return c.json({ error: "Invalid audit ID" }, 400);
  const result = await withUser(c.get("user").user_id, (client) => client.query("UPDATE subscription_audits SET is_dismissed = 1 WHERE id = $1 AND user_id = $2", [c.req.param("id"), c.get("user").user_id]));
  return result.rowCount ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
});
