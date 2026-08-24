import { describe, expect, it } from "vitest";
import { pool } from "../db";
import { createUser, fixtureDb, rawRequest } from "../test/helpers";

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

    // 4th request hits the IP-based rate limit â†’ 429.
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
