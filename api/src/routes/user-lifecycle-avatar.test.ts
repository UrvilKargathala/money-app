import { describe, expect, it } from "vitest";
import { fixtureDb, requestAs } from "../test/helpers";

const db = fixtureDb();

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function upload(user: { token: string }, bytes: Uint8Array, contentType = "image/png") {
  return requestAs(user as never, "/api/users/me/avatar", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes as unknown as ArrayBuffer,
  });
}

describe("avatar upload and serving", () => {
  it("uploads, streams back bytes, and 404s for users without one", async () => {
    const empty = await requestAs(db.bob, "/api/users/me/avatar");
    expect(empty.status).toBe(404);

    const up = await upload(db.alice, PNG);
    expect(up.status).toBe(200);
    expect(((await up.json()) as { success: boolean }).success).toBe(true);

    const got = await requestAs(db.alice, "/api/users/me/avatar");
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);

    // Tenant isolation: bob cannot fetch alice's avatar.
    const cross = await requestAs(db.bob, "/api/users/me/avatar");
    expect(cross.status).toBe(404);
  });

  it("re-upload replaces the previous blob under a stable key", async () => {
    const first = new Uint8Array([...PNG, 1, 2, 3, 4]);
    const second = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8, 9]);
    expect((await upload(db.alice, first)).status).toBe(200);
    expect((await upload(db.alice, second)).status).toBe(200);
    const got = await requestAs(db.alice, "/api/users/me/avatar");
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(second);
  });

  it("rejects empty, oversized and non-image uploads", async () => {
    expect((await upload(db.alice, new Uint8Array(0))).status).toBe(400);
    expect((await upload(db.alice, new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(400);
    expect((await upload(db.alice, PNG, "text/plain")).status).toBe(400);
  });
});
