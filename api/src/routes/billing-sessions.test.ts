import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { fixtureDb, postAs, requestAs, TEST_PASSWORD } from "../test/helpers";
import { withUser, pool } from "../db";
import { hashToken } from "../session";
import { handleSubscriptionUpdate } from "../queries/billing";

/**
 * Cross-device sync rule:
 * - free plan → single active session (newest login wins, older tokens 401)
 * - trial / monthly / annual / lifetime → unlimited simultaneous sessions
 * - downgrade to free (subscription canceled) trims to the newest session
 */

async function login(email: string): Promise<string> {
  const res = await postAs(
    { userId: 0, email, token: "" },
    "/api/auth/login",
    { email, password: TEST_PASSWORD }
  );
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

async function backdateUser(userId: number, days: number): Promise<void> {
  await pool.query(`UPDATE users SET created_at = CURRENT_TIMESTAMP - ($1 || ' days')::interval WHERE user_id = $2`, [
    String(days),
    userId,
  ]);
}

async function grantPaidPlan(userId: number, planCode = "monthly"): Promise<void> {
  await withUser(userId, async (client) => {
    const price = await client.query<{ id: string }>(
      `SELECT id FROM plan_prices WHERE plan_code = $1 AND is_current = 1 LIMIT 1`,
      [planCode]
    );
    await client.query(
      `INSERT INTO user_plan_subscriptions (user_id, plan_code, status, provider, price_id)
       VALUES ($1, $2, 'active', 'manual', $3::uuid)`,
      [userId, planCode, price.rows[0]?.id ?? null]
    );
    await client.query(`UPDATE user_settings SET plan_code = $2 WHERE user_id = $1`, [userId, planCode]);
  });
}

async function activeSessionCount(userId: number): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM auth_tokens WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
    [userId]
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function seedExtraSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at) VALUES ($1, $2, 'session', CURRENT_TIMESTAMP + INTERVAL '7 days')`,
    [userId, hashToken(token)]
  );
  return token;
}

describe("cross-device sync", () => {
  const db = fixtureDb();

  it("free plan: second login kicks the first session", async () => {
    await backdateUser(db.alice.userId, 40); // past trial → free
    const first = await login(db.alice.email);
    const second = await login(db.alice.email);

    const stale = await requestAs({ ...db.alice, token: first }, "/api/auth/me");
    expect(stale.status).toBe(401);
    const fresh = await requestAs({ ...db.alice, token: second }, "/api/auth/me");
    expect(fresh.status).toBe(200);
    expect(await activeSessionCount(db.alice.userId)).toBe(1);
  });

  it("paid plan: simultaneous logins on multiple devices all stay valid", async () => {
    await grantPaidPlan(db.alice.userId, "monthly");
    const first = await login(db.alice.email);
    const second = await login(db.alice.email);

    expect((await requestAs({ ...db.alice, token: first }, "/api/auth/me")).status).toBe(200);
    expect((await requestAs({ ...db.alice, token: second }, "/api/auth/me")).status).toBe(200);
    expect(await activeSessionCount(db.alice.userId)).toBeGreaterThanOrEqual(2);
  });

  it("trial: simultaneous sessions allowed (full monthly access)", async () => {
    // fresh fixture user → created_at now → in 30d trial window
    const first = await login(db.bob.email);
    const second = await login(db.bob.email);

    expect((await requestAs({ ...db.bob, token: first }, "/api/auth/me")).status).toBe(200);
    expect((await requestAs({ ...db.bob, token: second }, "/api/auth/me")).status).toBe(200);
  });

  it("downgrade to free trims sessions to the newest one", async () => {
    await grantPaidPlan(db.alice.userId, "monthly");
    const older = await seedExtraSession(db.alice.userId);
    // ensure distinct created_at ordering
    await pool.query(`UPDATE auth_tokens SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE token_hash = $1`, [
      hashToken(older),
    ]);
    const newer = await seedExtraSession(db.alice.userId);
    expect(await activeSessionCount(db.alice.userId)).toBeGreaterThanOrEqual(2);

    await backdateUser(db.alice.userId, 40); // trial lapsed → free after cancel
    await withUser(db.alice.userId, async (client) => {
      await handleSubscriptionUpdate(client, {
        userId: db.alice.userId,
        subscriptionId: "sub_test_downgrade",
        status: "canceled",
      });
    });

    expect(await activeSessionCount(db.alice.userId)).toBe(1);
    const survivor = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM auth_tokens WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL`,
      [db.alice.userId]
    );
    expect(survivor.rows[0]?.token_hash).toBe(hashToken(newer));
  });

  it("cross-user isolation: bob's sessions untouched by alice's login", async () => {
    await backdateUser(db.alice.userId, 40);
    await backdateUser(db.bob.userId, 40);
    const bobToken = await login(db.bob.email);
    await login(db.alice.email);
    await login(db.alice.email);
    expect((await requestAs({ ...db.bob, token: bobToken }, "/api/auth/me")).status).toBe(200);
  });
});
