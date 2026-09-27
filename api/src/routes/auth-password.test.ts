import { describe, expect, it } from "vitest";
import { TEST_PASSWORD, fixtureDb, postAs } from "../test/helpers";
import { rateLimitConfig } from "../rate-limit-config";
import { __clearRateLimitStore } from "../rate-limit";

const db = fixtureDb();

const changePassword = (user: typeof db.alice, body: unknown) =>
  postAs(user, "/api/auth/change-password", body);

describe("POST /api/auth/change-password", () => {
  it("rejects an identical new password without re-hashing", async () => {
    const res = await changePassword(db.alice, {
      current_password: TEST_PASSWORD,
      new_password: TEST_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(
      ((await res.json()) as { fieldErrors: { new_password: string } })
        .fieldErrors.new_password
    ).toContain("different");
  });

  it("accepts a different, policy-valid password", async () => {
    const res = await changePassword(db.alice, {
      current_password: TEST_PASSWORD,
      new_password: "BrandNewPass456!",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean }).success).toBe(true);
  });

  it("rejects a wrong current password", async () => {
    const res = await changePassword(db.alice, {
      current_password: "WrongPass123!",
      new_password: "BrandNewPass456!",
    });
    expect(res.status).toBe(401);
  });
});

describe("password-change rate limit (5 req / 100s -> 10 min block)", () => {
  it("blocks the 6th rapid attempt with 429 + Retry-After", async () => {
    __clearRateLimitStore();
    try {
      for (let i = 0; i < 5; i++) {
        const res = await changePassword(db.alice, {
          current_password: "WrongPass123!",
          new_password: "BrandNewPass456!",
        });
        expect(res.status).toBe(401);
      }
      const sixth = await changePassword(db.alice, {
        current_password: "WrongPass123!",
        new_password: "BrandNewPass456!",
      });
      expect(sixth.status).toBe(429);
      expect(sixth.headers.get("retry-after")).toBe(
        String(rateLimitConfig.passwordChange.blockSeconds)
      );
    } finally {
      __clearRateLimitStore();
    }
  });

  it("maxRequests 0 disables the limiter", async () => {
    __clearRateLimitStore();
    const prev = rateLimitConfig.passwordChange.maxRequests;
    rateLimitConfig.passwordChange.maxRequests = 0;
    try {
      for (let i = 0; i < 6; i++) {
        const res = await changePassword(db.alice, {
          current_password: "WrongPass123!",
          new_password: "BrandNewPass456!",
        });
        expect(res.status).toBe(401);
      }
    } finally {
      rateLimitConfig.passwordChange.maxRequests = prev;
      __clearRateLimitStore();
    }
  });
});
