import { randomBytes } from "node:crypto";
import { afterEach, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { app } from "../app";
import { pool } from "../db";
import { hashToken } from "../session";

export const TEST_PASSWORD = "TestPass123!";

export type TestUser = {
  userId: number;
  email: string;
  token: string;
};

export function jsonRequest(
  path: string,
  method: string,
  body: unknown
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function rawRequest(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return app.request(path, init);
}

export async function requestAs(
  user: TestUser,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: { ...init?.headers, cookie: `mm_session=${user.token}` },
  });
}

export async function postAs(
  user: TestUser,
  path: string,
  body: unknown
): Promise<Response> {
  return requestAs(user, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchAs(
  user: TestUser,
  path: string,
  body: unknown
): Promise<Response> {
  return requestAs(user, path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Inserts a full fixture user (users + profile + settings + session token)
 * directly — fast and immune to login rate limiting.
 */
export async function createUser(email: string): Promise<TestUser> {
  const result = await pool.query<{ user_id: number }>(
    `INSERT INTO users (email, hashed_password, email_verified_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING user_id`,
    [email, await bcrypt.hash(TEST_PASSWORD, 4)]
  );
  const userId = result.rows[0].user_id;
  await pool.query(
    `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, $2)`,
    [userId, email.split("@")[0]]
  );
  await pool.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [userId]);
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at)
     VALUES ($1, $2, 'session', CURRENT_TIMESTAMP + INTERVAL '7 days')`,
    [userId, hashToken(token)]
  );
  return { userId, email, token };
}

export async function createAccount(user: TestUser, name: string): Promise<string> {
  const res = await postAs(user, "/api/accounts", {
    name,
    type: "bank_savings",
    opening_balance: 100000,
  });
  if (!res.ok) throw new Error(`createAccount failed: ${res.status}`);
  const list = (await (
    await requestAs(user, "/api/accounts")
  ).json()) as { accounts: { id: string; name: string }[] };
  const account = list.accounts.find((a) => a.name === name);
  if (!account) throw new Error("createAccount: not found after create");
  return account.id;
}

export async function createExpense(
  user: TestUser,
  accountId: string,
  categoryId: string,
  amount: number,
  date: string
): Promise<string> {
  const res = await postAs(user, "/api/transactions", {
    type: "expense",
    account_id: accountId,
    category_id: categoryId,
    amount: String(amount),
    date,
    description: "test expense",
  });
  if (!res.ok) {
    throw new Error(`createExpense failed: ${res.status} ${await res.text()}`);
  }
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.userId]
  );
  if (!result.rows[0]) throw new Error("createExpense: no transaction row found");
  return result.rows[0].id;
}

export async function createIncome(
  user: TestUser,
  accountId: string,
  categoryId: string,
  amount: number,
  date: string
): Promise<string> {
  const res = await postAs(user, "/api/transactions", {
    type: "income",
    account_id: accountId,
    category_id: categoryId,
    amount: String(amount),
    date,
    description: "test income",
  });
  if (!res.ok) {
    throw new Error(`createIncome failed: ${res.status} ${await res.text()}`);
  }
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.userId]
  );
  if (!result.rows[0]) throw new Error("createIncome: no transaction row found");
  return result.rows[0].id;
}

export async function createGoal(
  user: TestUser,
  name: string,
  target: number,
  targetDate: string
): Promise<string> {
  const res = await postAs(user, "/api/goals", {
    name,
    target_amount: String(target),
    target_date: targetDate,
    priority: "medium",
  });
  if (!res.ok) {
    throw new Error(`createGoal failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { goal: { id: string } };
  return body.goal.id;
}

export async function addContribution(
  user: TestUser,
  goalId: string,
  amount: number,
  date: string
): Promise<string> {
  const res = await postAs(user, `/api/goals/${goalId}/contributions`, {
    amount: String(amount),
    date,
  });
  if (!res.ok) {
    throw new Error(`addContribution failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { contribution: { id: string } };
  return body.contribution.id;
}

export async function createDebt(
  user: TestUser,
  name: string,
  params: {
    type?: string;
    principalOriginal?: number;
    principalOutstanding?: number;
    interestRate?: number;
    emiAmount?: number;
    tenureMonths?: number;
    startDate?: string;
    accountId?: string;
  } = {}
): Promise<string> {
  const res = await postAs(user, "/api/debts", {
    name,
    type: params.type ?? "personal_loan",
    principal_original: String(params.principalOriginal ?? params.principalOutstanding ?? 120000),
    principal_outstanding: String(params.principalOutstanding ?? 120000),
    interest_rate: String(params.interestRate ?? 12),
    emi_amount: String(params.emiAmount ?? 10000),
    tenure_months: String(params.tenureMonths ?? 12),
    start_date: params.startDate ?? "2025-01-15",
    ...(params.accountId ? { account_id: params.accountId } : {}),
  });
  if (!res.ok) {
    throw new Error(`createDebt failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { debt: { id: string } };
  return body.debt.id;
}

export async function findCategory(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM categories WHERE name = $1 AND user_id IS NULL LIMIT 1`,
    [name]
  );
  if (!result.rows[0]) throw new Error(`System category not found: ${name}`);
  return result.rows[0].id;
}

export async function createCategory(
  user: TestUser,
  name: string,
  parentId?: string
): Promise<string> {
  const res = await postAs(user, "/api/categories", {
    name,
    parent_id: parentId ?? "",
    color: "#888888",
    icon: "tag",
  });
  if (!res.ok) throw new Error(`createCategory failed: ${res.status}`);
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM categories WHERE user_id = $1 AND name = $2`,
    [user.userId, name]
  );
  if (!result.rows[0]) throw new Error("createCategory: not found after create");
  return result.rows[0].id;
}

/**
 * Truncates every user-owned table (system-seeded rows like account_types
 * survive) and re-creates the fixture users.
 */
export async function resetDb(): Promise<{ alice: TestUser; bob: TestUser }> {
  await pool.query(
    `TRUNCATE TABLE
       auth_tokens, user_profiles, user_settings, users,
       accounts, transactions, transaction_splits,
       tags, tags_transactions, categories,
       budgets, budget_alerts, budget_rollovers, budget_templates, budget_items,
       account_transfers, audit_logs, login_attempts, access_logs,
       bills, subscriptions, payment_history, bill_reminders, subscription_audits,
       goals, goal_templates, goal_contributions, goal_snapshots, goal_milestones,
       debts, debt_payments, amortization_schedule
     RESTART IDENTITY CASCADE`
  );
  const alice = await createUser("alice@moneymind.test");
  const bob = await createUser("bob@moneymind.test");
  return { alice, bob };
}

/**
 * Standard suite harness: resets user data before the suite and after each
 * test so tests are independent. Read `db.alice`/`db.bob` inside test bodies
 * (the object is mutated by the harness, so fields are always current).
 */
export function fixtureDb(): {
  alice: TestUser;
  bob: TestUser;
} {
  const state = { alice: null as unknown as TestUser, bob: null as unknown as TestUser };
  beforeAll(async () => {
    const users = await resetDb();
    state.alice = users.alice;
    state.bob = users.bob;
  });
  afterEach(async () => {
    const users = await resetDb();
    state.alice = users.alice;
    state.bob = users.bob;
  });
  return state;
}
