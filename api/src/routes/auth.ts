import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { withUser } from "../db";
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
import { createUserWithDefaults, findActiveUserByEmail } from "../queries/auth";
import {
  createSessionRecord,
  revokeSessionByToken,
  hashToken,
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

  const user = await findActiveUserByEmail(email);

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
  // Free plan: single active session — revoke others (newest wins)
  try {
    const { enforceSingleSessionIfFree } = await import("../queries/entitlements");
    await enforceSingleSessionIfFree(user!.user_id, hashToken(session.token));
  } catch {}
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
      return createUserWithDefaults(client, {
        email,
        hashedPassword,
        name,
      });
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
  try {
    const { enforceSingleSessionIfFree } = await import("../queries/entitlements");
    await enforceSingleSessionIfFree(userId!, hashToken(session.token));
  } catch {}
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

import { registerAuthExtras } from './auth-extras';
registerAuthExtras(auth);

export { auth };
