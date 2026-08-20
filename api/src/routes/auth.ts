import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { query, withUser } from "../db";
import {
  getClientIp,
  isRateLimited,
  isSignupRateLimited,
  normalizeEmail,
  recordAccessLog,
  recordLoginAttempt,
  verifyPassword,
  verifyDummyPassword,
  hashPassword,
  isValidPassword,
  passwordPolicyHint,
} from "../auth";
import {
  createSessionRecord,
  revokeSessionByToken,
} from "../session";
import { SESSION_COOKIE } from "../constants";
import { isUniqueViolation, readJson } from "./helpers";
import { requireAuth } from "../middleware";

export type SignupFieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

type UserRow = {
  user_id: number;
  email: string;
  hashed_password: string | null;
};

const auth = new Hono();

auth.post("/login", async (c) => {
  const body = await readJson(c);
  const rawEmail = String(body.email ?? "");
  const password = String(body.password ?? "");
  const remember = body.remember === true;

  const email = normalizeEmail(rawEmail);

  if (!EMAIL_RE.test(email)) {
    return c.json({ error: "Please enter a valid email address." }, 400);
  }
  if (!password) {
    return c.json({ error: "Please enter your password." }, 400);
  }

  if (await isRateLimited(email, getClientIp(c))) {
    return c.json(
      { error: "Too many failed attempts. Please try again in 15 minutes." },
      429
    );
  }

  const userResult = await query<UserRow>(
    `SELECT user_id, email, hashed_password FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  const user = userResult.rows[0];

  let passwordOk = false;
  if (user?.hashed_password != null) {
    passwordOk = await verifyPassword(password, user.hashed_password);
  } else {
    await verifyDummyPassword(password);
  }

  await recordLoginAttempt(
    email,
    passwordOk,
    user?.user_id ?? null,
    getClientIp(c)
  );
  await recordAccessLog(
    passwordOk ? user!.user_id : null,
    c,
    passwordOk ? "login" : "failed_login"
  );

  if (!passwordOk) {
    return c.json(
      { error: "Incorrect email or password. Please try again." },
      401
    );
  }

  const session = await createSessionRecord(user!.user_id, remember);
  return c.json(session);
});

auth.post("/signup", async (c) => {
  const body = await readJson(c);
  const name = String(body.name ?? "").trim();
  const rawEmail = String(body.email ?? "");
  const password = String(body.password ?? "");
  const confirm = String(body.confirm ?? "");

  const email = normalizeEmail(rawEmail);
  const fieldErrors: SignupFieldErrors = {};

  if (name.length < 2) {
    fieldErrors.name = "Please enter your full name.";
  }
  if (!EMAIL_RE.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }
  if (!isValidPassword(password)) {
    fieldErrors.password = passwordPolicyHint;
  }
  if (password !== confirm) {
    fieldErrors.confirm = "Passwords do not match.";
  }
  if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    fieldErrors.email = `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  if (await isSignupRateLimited(getClientIp(c))) {
    return c.json(
      { error: "Too many accounts created from this IP. Please try again later." },
      429
    );
  }

  let userId: number | null = null;
  try {
    userId = await withUser(0, async (client) => {
      const hashedPassword = await hashPassword(password);

      const userResult = await client.query<{ user_id: number }>(
        `INSERT INTO users (email, hashed_password)
         VALUES ($1, $2)
         RETURNING user_id`,
        [email, hashedPassword]
      );
      const uid = userResult.rows[0].user_id;

      await client.query(
        `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, $2)`,
        [uid, name]
      );
      await client.query(
        `INSERT INTO user_settings (user_id, currency, theme, language)
         VALUES ($1, 'INR', 'light', 'en')`,
        [uid]
      );
      await client.query(
        `INSERT INTO access_logs (user_id, action) VALUES ($1, 'signup')`,
        [uid]
      );
      return uid;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        {
          fieldErrors: {
            email: "This email is already registered. Try signing in instead.",
          },
        },
        409
      );
    }
    console.error("[api] signup failed:", err);
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  }

  const session = await createSessionRecord(userId!, true);
  return c.json(session);
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const userId = await revokeSessionByToken(token);
  if (userId != null) {
    await recordAccessLog(userId, c, "logout");
  }
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  return c.json(c.get("user"));
});

export { auth };
