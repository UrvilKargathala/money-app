import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { normalizeEmail, isValidPassword, passwordPolicyHint, hashPassword, verifyPassword } from "../auth";
import { findActiveUserByEmail } from "../queries/auth";
import { createAuthToken } from "../queries/user-tokens";
import {
  changePassword,
  consumeAndResetPassword,
  consumeAndVerifyEmail,
  consumeMagicLink,
  getCurrentPasswordHash,
} from "../queries/user-lifecycle";
import { getVaultInfo } from "../queries/vault";
import { sendLinkEmail } from "../utils/email";

/**
 * Registers password-reset / email-verification / magic-link endpoints on
 * the existing auth router.
 */
export function registerAuthExtras(auth: import("hono").Hono): void {
  auth.post("/forgot-password", async (c) => {
    const body = await readJson(c);
    const email = normalizeEmail(String(body.email ?? ""));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Please enter a valid email address." }, 400);
    }
    const user = await findActiveUserByEmail(email);
    if (!user) return c.json({ success: true });

    const rawToken = await withUser(user.user_id, (client) =>
      createAuthToken(client, { userId: user.user_id, tokenType: "password_reset", expiresInSeconds: 1800 })
    );
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
    await sendLinkEmail({
      to: email, subject: "Reset your MoneyMind password",
      intro: "Someone requested a password reset.", url,
      ctaText: "Reset Password", expiresInMinutes: 30,
    });
    return c.json({ success: true });
  });

  auth.post("/reset-password", async (c) => {
    const body = await readJson(c);
    const rawToken = String(body.token ?? "");
    const newPassword = String(body.new_password ?? "");
    if (!rawToken) return c.json({ error: "Missing reset token." }, 400);
    if (!isValidPassword(newPassword)) {
      return c.json({ fieldErrors: { new_password: passwordPolicyHint } }, 400);
    }
    try {
      const hashed = await hashPassword(newPassword);
      const result = await withUser(0, (client) =>
        consumeAndResetPassword(client, { rawToken, newPasswordHash: hashed })
      );
      if (!result) {
        return c.json({ error: "This reset link has expired or was already used." }, 410);
      }
      const vaultInfo = await getVaultInfo(result.userId);
      return c.json({ success: true, has_vault: vaultInfo?.vault_wrapped !== null });
    } catch (err) {
      console.error("[api] reset-password failed:", err);
      return c.json({ error: "Could not reset the password. Please try again." }, 500);
    }
  });

  auth.post("/verify-email", async (c) => {
    const body = await readJson(c);
    const rawToken = String(body.token ?? "");
    if (!rawToken) return c.json({ error: "Missing verification token." }, 400);
    const verified = await withUser(0, (client) => consumeAndVerifyEmail(client, rawToken));
    if (!verified) {
      return c.json({ error: "Verification link expired or already used." }, 410);
    }
    return c.json({ success: true });
  });

  auth.post("/resend-verification", requireAuth, async (c) => {
    const user = c.get("user");
    const rawToken = await withUser(user.user_id, (client) =>
      createAuthToken(client, { userId: user.user_id, tokenType: "email_verify", expiresInSeconds: 86400 })
    );
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/verify-email?token=${rawToken}`;
    await sendLinkEmail({
      to: user.email, subject: "Verify your MoneyMind email",
      intro: "Click below to verify your email address.", url,
      ctaText: "Verify Email", expiresInMinutes: 1440,
    });
    return c.json({ success: true });
  });

  auth.post("/magic-link", async (c) => {
    const body = await readJson(c);
    const email = normalizeEmail(String(body.email ?? ""));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Please enter a valid email address." }, 400);
    }
    const user = await findActiveUserByEmail(email);
    if (!user) return c.json({ success: true });

    const rawToken = await withUser(user.user_id, (client) =>
      createAuthToken(client, { userId: user.user_id, tokenType: "magic_link", expiresInSeconds: 900 })
    );
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/magic-link/verify?token=${rawToken}`;
    await sendLinkEmail({
      to: email, subject: "Your MoneyMind login link",
      intro: "Click below to log in.", url,
      ctaText: "Log In", expiresInMinutes: 15,
    });
    return c.json({ success: true });
  });

  auth.get("/magic-link/verify", async (c) => {
    const rawToken = c.req.query("token") || "";
    if (!rawToken) return c.json({ error: "Missing token." }, 400);
    const userId = await withUser(0, (client) => consumeMagicLink(client, rawToken));
    if (userId === null) {
      return c.json({ error: "This login link has expired or was already used." }, 410);
    }
    const { createSessionRecord } = await import("../session");
    const session = await createSessionRecord(userId, true);
    return c.json(session);
  });

  auth.post("/change-password", requireAuth, async (c) => {
    const user = c.get("user");
    const body = await readJson(c);
    const currentPassword = String(body.current_password ?? "");
    const newPassword = String(body.new_password ?? "");
    if (!currentPassword) return c.json({ error: "Enter your current password." }, 400);
    if (!isValidPassword(newPassword)) {
      return c.json({ fieldErrors: { new_password: passwordPolicyHint } }, 400);
    }

    const storedHash = await getCurrentPasswordHash(user.user_id);
    if (!storedHash || !(await verifyPassword(currentPassword, storedHash))) {
      return c.json({ error: "Current password is incorrect." }, 401);
    }
    const newHash = await hashPassword(newPassword);

    try {
      await withUser(user.user_id, (client) =>
        changePassword(client, {
          userId: user.user_id,
          currentPasswordHashVerified: true,
          newPasswordHash: newHash,
          keepSessionTokenId: user.token_id,
        })
      );
    } catch (err) {
      console.error("[api] change-password failed:", err);
      return c.json({ error: "Could not change the password. Please try again." }, 500);
    }
    return c.json({ success: true });
  });
}
