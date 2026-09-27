import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  TEST_PASSWORD,
  createUser,
  fixtureDb,
  rawRequest,
  requestAs,
} from "../test/helpers";
import { rateLimitConfig } from "../rate-limit-config";
import { __clearRateLimitStore } from "../rate-limit";

const db = fixtureDb();

describe("email action rate limiting (forgot-password + magic-link)", () => {
  it("allows first 3 requests then returns 429 on 4th from same IP", async () => {
    await createUser("rl-target@moneymind.test");
    const body = JSON.stringify({ email: "rl-target@moneymind.test" });
    const headers = { "content-type": "application/json" };

    // First 3 requests succeed (200 or success:true).
    for (let i = 0; i < 3; i++) {
      const res = await rawRequest("/api/auth/forgot-password", {
        method: "POST",
        headers,
        body,
      });
      expect(res.status).toBe(200);
    }

    // 4th request hits the IP-based rate limit -> 429.
    const fourth = await rawRequest("/api/auth/forgot-password", {
      method: "POST",
      headers,
      body,
    });
    expect(fourth.status).toBe(429);
    const errBody = (await fourth.json()) as { error: string };
    expect(errBody.error).toContain("Too many");

    // Magic-link also shares the same rate-limit bucket.
    const magic = await rawRequest("/api/auth/magic-link", {
      method: "POST",
      headers,
      body,
    });
    expect(magic.status).toBe(429);
  });

  it("magic-link has its own 3-request budget when no forgot-password calls precede it", async () => {
    const email = "magic-rl@moneymind.test";
    await createUser(email);
    const body = JSON.stringify({ email });

    for (let i = 0; i < 3; i++) {
      const res = await rawRequest("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(res.status).toBe(200);
    }
    const fourth = await rawRequest("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(fourth.status).toBe(429);
  });

  it("login burst: 4 rapid attempts -> 5th gets 429 + Retry-After", async () => {
    const email = "burst-rl@moneymind.test";
    await createUser(email);
    const headers = { "content-type": "application/json" };
    const attempt = (password: string) =>
      rawRequest("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      });

    for (let i = 0; i < 4; i++) {
      expect((await attempt("WrongPass123!")).status).toBe(401);
    }
    const fifth = await attempt("WrongPass123!");
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get("retry-after")).toBe(
      String(rateLimitConfig.login.blockSeconds)
    );
    expect(((await fifth.json()) as { error: string }).error).toContain(
      "10 minutes"
    );
  });

  it("login burst blocks even the correct password while blocked", async () => {
    const email = "burst-rl-correct@moneymind.test";
    await createUser(email);
    const headers = { "content-type": "application/json" };
    const attempt = (password: string) =>
      rawRequest("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      });

    for (let i = 0; i < 4; i++) {
      expect((await attempt("WrongPass123!")).status).toBe(401);
    }
    expect((await attempt(TEST_PASSWORD)).status).toBe(429);
  });

  it("login burst: maxRequests 0 disables the limiter", async () => {
    const prev = rateLimitConfig.login.maxRequests;
    rateLimitConfig.login.maxRequests = 0;
    try {
      const email = "burst-rl-off@moneymind.test";
      await createUser(email);
      for (let i = 0; i < 5; i++) {
        const res = await rawRequest("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: "WrongPass123!" }),
        });
        // Burst rule off; legacy failures-only rule allows 5/15min.
        expect(res.status).toBe(401);
      }
    } finally {
      rateLimitConfig.login.maxRequests = prev;
    }
  });

  it("non-existent email still consumes the rate limit budget (anti-enumeration)", async () => {
    const body = JSON.stringify({ email: "nobody@nowhere.test" });
    for (let i = 0; i < 3; i++) {
      await rawRequest("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    }
    const fourth = await rawRequest("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(fourth.status).toBe(429);
  });
});

describe("notifications read budget (in-memory cost guard)", () => {
  it("allows budget then 429s with Retry-After; 0 disables", async () => {
    __clearRateLimitStore();
    const prevMax = rateLimitConfig.notifications.maxRequests;
    const prevWin = rateLimitConfig.notifications.windowSeconds;
    rateLimitConfig.notifications.maxRequests = 3;
    rateLimitConfig.notifications.windowSeconds = 120;
    try {
      for (let i = 0; i < 3; i++) {
        expect(
          (await requestAs(db.alice, "/api/notifications/unread-count"))
            .status
        ).toBe(200);
      }
      const over = await requestAs(
        db.alice,
        "/api/notifications/unread-count"
      );
      expect(over.status).toBe(429);
      expect(over.headers.get("retry-after")).toBe("120");

      // Kill-switch: 0 disables the budget.
      rateLimitConfig.notifications.maxRequests = 0;
      expect(
        (await requestAs(db.alice, "/api/notifications/unread-count")).status
      ).toBe(200);
    } finally {
      rateLimitConfig.notifications.maxRequests = prevMax;
      rateLimitConfig.notifications.windowSeconds = prevWin;
      __clearRateLimitStore();
    }
  });
});
