import { describe, expect, it } from "vitest";
import { rawRequest, fixtureDb } from "./helpers";

const db = fixtureDb();

describe("test harness smoke", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await rawRequest("/api/accounts");
    expect(res.status).toBe(401);
  });

  it("authenticates a fixture user", async () => {
    const res = await rawRequest("/api/accounts", {
      headers: { cookie: `mm_session=${db.alice.token}` },
    });
    expect(res.status).toBe(200);
  });
});