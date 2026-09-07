import { createMiddleware } from "hono/factory";
import { query } from "./db";
import type { AppEnv } from "./middleware";

export type Plan = {
  plan_type: "free" | "premium";
  billing_cycle: "monthly" | "annual" | "lifetime" | null;
  premium_expires_at: string | null;
  legacy_member_number: number | null;
};
export const STARTER_LIMITS = { accounts: 2, budgets: 2, bills: 5, subscriptions: 3, goals: 1 } as const;
export const isPremium = (plan: Pick<Plan, "plan_type">) => plan.plan_type === "premium";
export const PREMIUM_REQUIRED = { error: "Upgrade to unlock this feature.", code: "PREMIUM_REQUIRED", upgrade_url: "/pricing" };

export async function getPlan(userId: number): Promise<Plan> {
  const result = await query<Plan>(
    "SELECT plan_type, billing_cycle, premium_expires_at, legacy_member_number FROM users WHERE user_id = $1", [userId]
  );
  if (!result.rows[0]) throw new Error("User not found");
  return result.rows[0];
}

// Billing metadata never determines feature access. Expiry reconciliation belongs
// to the future billing lifecycle, once downgrade/retention policy is agreed.
export const requirePremium = createMiddleware<AppEnv>(async (c, next) => {
  // Plans are informational for now; all features remain available until billing is enabled.
  await next();
});
