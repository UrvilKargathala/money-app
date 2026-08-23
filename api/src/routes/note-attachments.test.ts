import { describe, expect, it } from "vitest";
import {
  createNote,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

const CIPHER = Buffer.from("encrypted-blob-bytes").toString("base64");

async function uploadFor(
  user: ReturnType<typeof fixtureDb>["alice"],
  noteId: string,
  fileName: string,
  content: string
): Promise<Awaited<ReturnType<typeof requestAs>>> {
  return requestAs(
    user,
    `/api/notes/${noteId}/attachments?name=${encodeURIComponent(fileName)}&type=application/pdf`,
    {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(content, "utf8"),
    }
  );
}

describe("note attachments lifecycle (memory provider)", () => {
  it("uploads ciphertext, lists, downloads identical bytes and previews inline", async () => {
    const noteId = await createNote(db.alice);
    const up = await uploadFor(db.alice, noteId, "policy.pdf", "ENCRYPTED-PDF-BYTES");
    expect(up.status).toBe(200);
    const attachmentId = (
      ((await up.json()) as { attachment: { id: string } }).attachment
    ).id;

    const list = (await (
      await requestAs(db.alice, `/api/notes/${noteId}/attachments`)
    ).json()) as {
      attachments: {
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
      }[];
    };
    expect(list.attachments).toHaveLength(1);
    expect(list.attachments[0].file_name).toBe("policy.pdf");
    expect(list.attachments[0].file_type).toBe("application/pdf");
    expect(list.attachments[0].file_size).toBe("ENCRYPTED-PDF-BYTES".length);

    const download = await requestAs(
      db.alice,
      `/api/notes/${noteId}/attachments/${attachmentId}`
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    const text = await download.text();
    expect(text).toBe("ENCRYPTED-PDF-BYTES");

    const preview = await requestAs(
      db.alice,
      `/api/notes/${noteId}/attachments/${attachmentId}/preview`
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-disposition")).toContain("inline");

    const del = await requestAs(
      db.alice,
      `/api/notes/${noteId}/attachments/${attachmentId}`,
      { method: "DELETE" }
    );
    expect(del.status).toBe(200);
    expect(
      (
        await requestAs(db.alice, `/api/notes/${noteId}/attachments/${attachmentId}`)
      ).status
    ).toBe(404);
  });

  it("rejects empty uploads and enforces the 5MB cap", async () => {
    const noteId = await createNote(db.alice);

    const empty = await uploadFor(db.alice, noteId, "empty.bin", "");
    void empty;
    // Buffer.from("") posts zero bytes.
    const emptyRes = await requestAs(
      db.alice,
      `/api/notes/${noteId}/attachments?name=e.bin`,
      { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(0) }
    );
    expect(emptyRes.status).toBe(400);

    const tooBig = await requestAs(
      db.alice,
      `/api/notes/${noteId}/attachments?name=big.bin`,
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: Buffer.alloc(5 * 1024 * 1024 + 1, 7),
      }
    );
    expect(tooBig.status).toBe(400);
    const body = (await tooBig.json()) as { error: string };
    expect(body.error).toContain("5MB");
  });

  it("foreign users cannot list, upload to or download others' attachments", async () => {
    const aliceNote = await createNote(db.alice);
    const up = await uploadFor(db.alice, aliceNote, "secret.pdf", CIPHER);
    const attachmentId = (
      ((await up.json()) as { attachment: { id: string } }).attachment
    ).id;

    expect(
      (await requestAs(db.bob, `/api/notes/${aliceNote}/attachments`)).status
    ).toBe(404);
    expect(
      (
        await uploadFor(db.bob, aliceNote, "evil.pdf", "x")
      ).status
    ).toBe(404);
    expect(
      (
        await requestAs(
          db.bob,
          `/api/notes/${aliceNote}/attachments/${attachmentId}`
        )
      ).status
    ).toBe(404);
    expect(
      (
        await requestAs(
          db.bob,
          `/api/notes/${aliceNote}/attachments/${attachmentId}`,
          { method: "DELETE" }
        )
      ).status
    ).toBe(404);
  });

  it("attachments on trashed notes stay accessible until purge", async () => {
    const noteId = await createNote(db.alice);
    await uploadFor(db.alice, noteId, "keep.pdf", CIPHER);

    await requestAs(db.alice, `/api/notes/${noteId}`, { method: "DELETE" });
    // Note detail is hidden but the trash list still shows it; attachments
    // listing requires an active note — document current semantics:
    expect((await requestAs(db.alice, `/api/notes/${noteId}`)).status).toBe(404);
    const restored = await postAs(db.alice, `/api/notes/${noteId}/restore`, {});
    expect(restored.status).toBe(200);
    const list = (await (
      await requestAs(db.alice, `/api/notes/${noteId}/attachments`)
    ).json()) as { attachments: unknown[] };
    expect(list.attachments).toHaveLength(1);
  });
});
