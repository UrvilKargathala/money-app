import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth, type AppEnv } from "../middleware";
import { requirePremium } from "../entitlements";
import { detectSubscriptionAudits } from "../utils/subscription-audits";
import {
  dismissAudit,
  listActiveSubscriptionsForAudit,
  listVisibleAudits,
  lockUserForAudit,
  upsertAuditFindings,
} from "../queries/subscription-audits";

export const subscriptionAudits = new Hono<AppEnv>();
subscriptionAudits.use("*", requireAuth, requirePremium);
subscriptionAudits.get("/", async (c) => {
  const userId = c.get("user").user_id;
  const audits = await withUser(userId, async (client) => {
    await lockUserForAudit(client, userId);
    const rows = await listActiveSubscriptionsForAudit(client, userId);
    const findings = detectSubscriptionAudits(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
    await upsertAuditFindings(client, userId, findings);
    const visible = await listVisibleAudits<Record<string, unknown>>(
      client,
      userId,
      findings.map((f) => f.detection_key)
    );
    return visible.map((r) => ({ ...r, potential_savings: Number(r.potential_savings) }));
  });
  return c.json({ audits });
});
subscriptionAudits.post("/:id/dismiss", async (c) => {
  if (!/^[0-9a-f-]{36}$/i.test(c.req.param("id"))) return c.json({ error: "Invalid audit ID" }, 400);
  const updated = await withUser(c.get("user").user_id, (client) =>
    dismissAudit(client, c.get("user").user_id, c.req.param("id"))
  );
  return updated ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
});
