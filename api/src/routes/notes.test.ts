import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createNote,
  createUser,
  fixtureDb,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

describe("notes CRUD and lifecycle", () => {
  it("creates template-based and freeform notes with ciphertext", async () => {
    const tplId = await createNote(db.alice, {
      title: "Passport",
      category: "document",
      templateCode: "passport",
    });
    const freeId = await createNote(db.alice, {
      title: "Wi-Fi Password",
      category: "personal",
      templateCode: null,
      payload: "hunter2",
    });

    const list = (await (
      await requestAs(db.alice, "/api/notes")
    ).json()) as { notes: { id: string; template_code: string | null }[] };
    expect(list.notes).toHaveLength(2);

    const free = (await (
      await requestAs(db.alice, `/api/notes/${freeId}`)
    ).json()) as { note: { data_encrypted: string; data_iv: string; template_code: null } };
    expect(free.note.template_code).toBeNull();
    expect(free.note.data_encrypted).toBe(Buffer.from("hunter2").toString("base64"));
    expect(free.note.data_iv).toBe("iv-1234567890ab");
    void tplId;
  });

  it("validates required ciphertext and title", async () => {
    const res = await postAs(db.alice, "/api/notes", { title: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.title).toBeTruthy();
    expect(body.fieldErrors.data_encrypted).toBeTruthy();
    expect(body.fieldErrors.data_iv).toBeTruthy();
  });

  it("patches content with version lock (re-encrypt path)", async () => {
    const id = await createNote(db.alice);
    const ok = await requestAs(db.alice, `/api/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated Title",
        category: "financial",
        data_encrypted: Buffer.from("rotated").toString("base64"),
        data_iv: "iv-ffffffffffff",
        version: 1,
      }),
    });
    expect(ok.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Stale",
        data_encrypted: "eGt4",
        data_iv: "iv-000000000000",
        version: 1,
      }),
    });
    expect(stale.status).toBe(409);
  });

  it("metadata-only patch leaves ciphertext untouched", async () => {
    const id = await createNote(db.alice, { payload: "original-secret" });
    const res = await requestAs(db.alice, `/api/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Renamed Only", version: 1 }),
    });
    expect(res.status).toBe(200);
    const note = (await (
      await requestAs(db.alice, `/api/notes/${id}`)
    ).json()) as { note: { title: string; data_encrypted: string; version: number } };
    expect(note.note.title).toBe("Renamed Only");
    expect(note.note.data_encrypted).toBe(
      Buffer.from("original-secret").toString("base64")
    );
    expect(note.note.version).toBe(2);
  });

  it("soft-deletes to trash, restores within window, purges permanently", async () => {
    const restoreMe = await createNote(db.alice, { title: "Restore Me" });
    const purgeMe = await createNote(db.alice, { title: "Purge Me" });

    expect(
      (await requestAs(db.alice, `/api/notes/${restoreMe}`, { method: "DELETE" })).status
    ).toBe(200);

    let trash = (await (
      await requestAs(db.alice, "/api/notes/trash")
    ).json()) as { notes: { id: string }[] };
    expect(trash.notes.map((n) => n.id)).toContain(restoreMe);

    // Active list hides trashed notes.
    const active = (await (
      await requestAs(db.alice, "/api/notes")
    ).json()) as { notes: { id: string }[] };
    expect(active.notes.map((n) => n.id)).not.toContain(restoreMe);

    const restored = await postAs(db.alice, `/api/notes/${restoreMe}/restore`, {});
    expect(restored.status).toBe(200);
    expect((await requestAs(db.alice, `/api/notes/${restoreMe}`)).status).toBe(200);

    await requestAs(db.alice, `/api/notes/${purgeMe}`, { method: "DELETE" });
    const purge = await rawRequest(`/api/notes/${purgeMe}/purge`, {
      method: "DELETE",
      headers: { cookie: `mm_session=${db.alice.token}` },
    });
    expect(purge.status).toBe(200);
    // Gone for good — not even in trash.
    trash = (await (
      await requestAs(db.alice, "/api/notes/trash")
    ).json()) as typeof trash;
    expect(trash.notes.map((n) => n.id)).not.toContain(purgeMe);
  });

  it("pins and unpins; pinned notes sort first", async () => {
    const a = await createNote(db.alice, { title: "A Note" });
    await createNote(db.alice, { title: "B Note" });
    await createNote(db.alice, { title: "C Pinned", pinned: true });

    await postAs(db.alice, `/api/notes/${a}/pin`, {});
    const dupe = await postAs(db.alice, `/api/notes/${a}/pin`, {});
    expect(dupe.status).toBe(409);

    const list = (await (
      await requestAs(db.alice, "/api/notes")
    ).json()) as { notes: { title: string; is_pinned: number }[] };
    expect(list.notes[0].is_pinned).toBe(1);

    await postAs(db.alice, `/api/notes/${a}/unpin`, {});
    const again = await postAs(db.alice, `/api/notes/${a}/unpin`, {});
    expect(again.status).toBe(409);
  });

  it("search filters by title server-side", async () => {
    await createNote(db.alice, { title: "Zebra Vault Item" });
    await createNote(db.alice, { title: "Apple Vault Item" });
    const found = (await (
      await requestAs(db.alice, "/api/notes/search-placeholder")
    ).status, null);
    void found;
    const res = await requestAs(db.alice, "/api/notes?search=zebra");
    const body = (await res.json()) as { notes: { title: string }[] };
    expect(body.notes.map((n) => n.title)).toEqual(["Zebra Vault Item"]);
  });
});

describe("note categories", () => {
  it("lists seeded categories plus in-use customs with counts", async () => {
    await createNote(db.alice, { category: "financial" });
    await createNote(db.alice, { title: "Custom Thing", category: "my-custom" });

    const body = (await (
      await requestAs(db.alice, "/api/notes/categories")
    ).json()) as { categories: { name: string; count: number; seeded: boolean }[] };

    const financial = body.categories.find((c) => c.name === "financial")!;
    expect(financial.count).toBe(1);
    const custom = body.categories.find((c) => c.name === "my-custom")!;
    expect(custom.seeded).toBe(false);
    // All ten seeded names appear.
    expect(body.categories.filter((c) => c.seeded).length).toBeGreaterThanOrEqual(10);
  });

  it("batch-renames every matching note in ONE statement", async () => {
    await createNote(db.alice, { title: "One", category: "old-cat" });
    await createNote(db.alice, { title: "Two", category: "old-cat" });
    await createNote(db.alice, { title: "Other", category: "keep-me" });

    const res = await requestAs(db.alice, "/api/notes/categories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from_category: "old-cat", to_category: "new-cat" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { renamed_count: number };
    expect(body.renamed_count).toBe(2);

    const list = (await (
      await requestAs(db.alice, "/api/notes?category=new-cat")
    ).json()) as { notes: { title: string }[] };
    expect(list.notes.map((n) => n.title).sort()).toEqual(["One", "Two"]);

    const same = await requestAs(db.alice, "/api/notes/categories", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from_category: "new-cat", to_category: "new-cat" }),
    });
    expect(same.status).toBe(400);
  });
});

describe("note templates lookup", () => {
  it("serves the seeded template registry", async () => {
    const all = (await (
      await requestAs(db.bob, "/api/note-templates")
    ).json()) as { templates: { template_code: string; fields: unknown }[] };
    expect(all.templates.length).toBeGreaterThanOrEqual(8);
    const passport = all.templates.find((t) => t.template_code === "passport")!;
    expect(passport.fields).toBeTruthy();

    const one = await requestAs(db.bob, "/api/note-templates/passport");
    expect(one.status).toBe(200);
    expect(
      ((await one.json()) as { template: { name: string } }).template.name
    ).toBe("Passport");

    expect(
      (await requestAs(db.bob, "/api/note-templates/nonexistent")).status
    ).toBe(404);
  });
});

describe("vault key lifecycle", () => {
  it("wrapped-key starts uninitialized; rewrap stores params + sealed recovery copy", async () => {
    const before = (await (
      await requestAs(db.alice, "/api/vault/wrapped-key")
    ).json()) as {
      initialized: boolean;
      vault_wrapped: string | null;
      has_recovery: boolean;
    };
    expect(before.initialized).toBe(false);
    expect(before.vault_wrapped).toBeNull();

    const rewrap = await postAs(db.alice, "/api/vault/rewrap", {
      wrapped: "b3JhbmdlLXdyYXBwZWQta2V5",
      kdf_salt: "c2FsdA",
      kdf_iters: 310000,
      recovery_wrapped: "recover-vault-raw-material",
    });
    expect(rewrap.status).toBe(200);

    const after = (await (
      await requestAs(db.alice, "/api/vault/wrapped-key")
    ).json()) as {
      initialized: boolean;
      vault_wrapped: string;
      kdf: { salt: string; iterations: number };
      has_recovery: boolean;
    };
    expect(after.initialized).toBe(true);
    expect(after.vault_wrapped).toBe("b3JhbmdlLXdyYXBwZWQta2V5");
    expect(after.kdf.iterations).toBe(310000);
    expect(after.has_recovery).toBe(true);

    // Recovery copy is sealed under the server DEK — never stored verbatim.
    const row = await pool.query<{ vault_recovery_wrapped: string }>(
      `SELECT vault_recovery_wrapped FROM user_settings WHERE user_id = $1`,
      [db.alice.userId]
    );
    expect(row.rows[0].vault_recovery_wrapped).not.toContain("recover-vault-raw-material");

    const status = (await (
      await requestAs(db.alice, "/api/vault/recovery-status")
    ).json()) as { has_recovery: boolean; initialized: boolean };
    expect(status.has_recovery).toBe(true);
    expect(status.initialized).toBe(true);

    // Rewrap without recovery copy keeps the existing one.
    const rewrap2 = await postAs(db.alice, "/api/vault/rewrap", {
      wrapped: "bmV3LXdyYXBwZWQ",
      kdf_salt: "c2FsdDI",
      kdf_iters: 400000,
    });
    expect(rewrap2.status).toBe(200);
    const after2 = (await (
      await requestAs(db.alice, "/api/vault/wrapped-key")
    ).json()) as { vault_wrapped: string; has_recovery: boolean };
    expect(after2.vault_wrapped).toBe("bmV3LXdyYXBwZWQ");
    expect(after2.has_recovery).toBe(true);
  });

  it("rewrap validates ranges and required fields", async () => {
    const bad = await postAs(db.alice, "/api/vault/rewrap", {
      wrapped: "",
      kdf_salt: "",
      kdf_iters: 5,
    });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.wrapped).toBeTruthy();
    expect(body.fieldErrors.kdf_salt).toBeTruthy();
    expect(body.fieldErrors.kdf_iters).toBeTruthy();
  });

  it("unlock/verify-password check real credentials; lock is a success no-op", async () => {
    // Fixture users get TEST_PASSWORD via direct insert.
    const ok = await postAs(db.alice, "/api/vault/unlock", {
      password: "TestPass123!",
    });
    expect(ok.status).toBe(200);

    const bad = await postAs(db.alice, "/api/vault/unlock", { password: "wrong" });
    expect(bad.status).toBe(401);

    const verify = await postAs(db.alice, "/api/vault/verify-password", {
      password: "TestPass123!",
    });
    expect(verify.status).toBe(200);
    expect(((await verify.json()) as { verified: boolean }).verified).toBe(true);

    const lock = await postAs(db.alice, "/api/vault/lock", {});
    expect(lock.status).toBe(200);
  });
});

describe("cross-user isolation", () => {
  it("notes, trash and vault info are scoped per user", async () => {
    const aliceNote = await createNote(db.alice, { title: "Alice Secret" });

    const bobList = (await (
      await requestAs(db.bob, "/api/notes")
    ).json()) as { notes: unknown[] };
    expect(bobList.notes).toEqual([]);

    expect(
      (await requestAs(db.bob, `/api/notes/${aliceNote}`)).status
    ).toBe(404);
    expect(
      (
        await requestAs(db.bob, `/api/notes/${aliceNote}`, { method: "DELETE" })
      ).status
    ).toBe(404);
    expect(
      (await postAs(db.bob, `/api/notes/${aliceNote}/pin`, {})).status
    ).toBe(404);
    expect(
      (
        await requestAs(db.bob, `/api/notes/${aliceNote}/purge`, { method: "DELETE" })
      ).status
    ).toBe(404);

    // Bob's vault is independent.
    const bobVault = (await (
      await requestAs(db.bob, "/api/vault/wrapped-key")
    ).json()) as { initialized: boolean };
    expect(bobVault.initialized).toBe(false);
  });

  it("CSV export contains headers only — never ciphertext", async () => {
    await createNote(db.alice, { title: "Export Me", payload: "topsecret" });
    const res = await requestAs(db.alice, "/api/notes/export");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Title,Category,Template,Pinned,Updated");
    expect(text).toContain("Export Me");
    expect(text).not.toContain("topsecret");
    expect(text).not.toMatch(/data_encrypted/i);
  });
});

// Fresh-user sanity: brand-new account sees empty everything.
describe("fresh user state", () => {
  it("new users have no notes and an uninitialized vault", async () => {
    const carol = await createUser("carol@moneymind.test");
    const notes = (await (
      await requestAs(carol, "/api/notes")
    ).json()) as { notes: unknown[] };
    expect(notes.notes).toEqual([]);
    const vault = (await (
      await requestAs(carol, "/api/vault/recovery-status")
    ).json()) as { initialized: boolean; has_recovery: boolean };
    expect(vault.initialized).toBe(false);
    expect(vault.has_recovery).toBe(false);
  });
});
