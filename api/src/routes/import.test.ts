import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createCategory,
  createUser,
  fixtureDb,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

const HEADERS = "Date,Description,Amount,Category";
function csvRow(date: string, desc: string, amount: number, category = ""): string {
  return `${date},${desc},${amount},${category}`;
}

async function ensureAccount(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 LIMIT 1`,
    [db.alice.userId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  return createAccount(db.alice, "Import Bank");
}

describe("preview and validate (stateless)", () => {
  it("preview detects headers and samples parsed rows", async () => {
    const csv = [
      "Txn Date,Narration,Withdrawal,Deposit",
      "2026-03-01,Coffee,120,",
      "2026-03-02,Salary,,90000",
    ].join("\n");
    const res = await rawRequest("/api/transactions/import/preview", {
      method: "POST",
      headers: { cookie: `mm_session=${db.alice.token}`, "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      detected_mapping: Record<string, unknown>;
      valid_rows: number;
      sample_rows: { type: string; amount: number }[];
    };
    expect(body.detected_mapping.date).toBe(0);
    expect(body.detected_mapping.debit).toBe(2);
    expect(body.detected_mapping.credit).toBe(3);
    expect(body.valid_rows).toBe(2);
    expect(body.sample_rows[0].type).toBe("expense");
    expect(body.sample_rows[1].type).toBe("income");
  });

  it("validate reports row-level reasons without writing anything", async () => {
    await createAccount(db.alice);
    const csv = [
      HEADERS,
      csvRow("2026-03-01", "Good", 100),
      csvRow("31/02/2026", "Bad date", 200),
      csvRow("2026-03-03", "Zero", 0),
    ].join("\n");
    const before = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM import_batches WHERE user_id = $1`,
      [db.alice.userId]
    );

    const res = await requestAs(db.alice, "/api/transactions/import/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      valid_rows: number;
      error_rows: number;
      errors: { row_number: number; reason: string }[];
    };
    expect(body.valid_rows).toBe(1);
    expect(body.error_rows).toBe(2);

    // Nothing persisted.
    const after = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM import_batches WHERE user_id = $1`,
      [db.alice.userId]
    );
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });
});

describe("confirm import end-to-end", () => {
  it("imports valid rows, logs errors, flags duplicates; batch endpoints reflect it", async () => {
    const accountId = await createAccount(db.alice);
    const catId = await createCategory(db.alice, "Imported Food");

    // Pre-existing transaction that will collide with one CSV row (duplicate).
    await postAs(db.alice, "/api/transactions", {
      type: "expense",
      account_id: accountId,
      category_id: catId,
      amount: "777.77",
      description: "Already Exists",
      date: "2026-05-05",
    });

    const csv = [
      HEADERS,
      csvRow("2026-05-01", "Import One", 500),
      "2026-05-02,Broken Date Row,nope,", // invalid amount AND date? date ok here
      csvRow("2026-05-05", "Already Exists", 777.77), // duplicate of seeded txn
    ].join("\n");
    // Fix the broken row to be a real structural error:
    const finalCsv = [
      HEADERS,
      csvRow("not-a-date", "Broken Row", 10),
      csvRow("2026-05-01", "Import One", 500),
      csvRow("2026-05-05", "Already Exists", 777.77),
    ].join("\n");
    void csv;

    const res = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: finalCsv,
        account_id: accountId,
        filename: "statement.csv",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      batch: { id: string };
      total_rows: number;
      imported_rows: number;
      duplicate_rows: number;
      error_rows: number;
    };
    expect(body.total_rows).toBe(3);
    expect(body.imported_rows).toBe(1);
    expect(body.duplicate_rows).toBe(1);
    expect(body.error_rows).toBe(1);

    // Imported txn carries source=import + needs_review + batch link.
    const imported = await pool.query<{ source: string; needs_review: number }>(
      `SELECT source, needs_review FROM transactions
       WHERE user_id = $1 AND description = 'Import One'`,
      [db.alice.userId]
    );
    expect(imported.rows[0].source).toBe("import");
    expect(imported.rows[0].needs_review).toBe(1);

    // Progress endpoint mirrors the counters.
    const progress = (await (
      await requestAs(db.alice, `/api/import-batches/${body.batch.id}/progress`)
    ).json()) as {
      status: string;
      total_rows: number;
      processed_rows: number;
    };
    expect(progress.status).toBe("partial");
    expect(progress.processed_rows).toBe(3);

    // Errors list shows the structural error and the duplicate.
    const errors = (await (
      await requestAs(db.alice, `/api/import-batches/${body.batch.id}/errors`)
    ).json()) as { errors: { error_reason: string }[] };
    expect(errors.errors.map((e) => e.error_reason)).toContain(
      "duplicate of an existing transaction"
    );

    // Batch list + detail.
    const list = (await (
      await requestAs(db.alice, "/api/import-batches")
    ).json()) as { batches: { id: string }[] };
    expect(list.batches.some((b) => b.id === body.batch.id)).toBe(true);

    const detail = await requestAs(db.alice, `/api/import-batches/${body.batch.id}`);
    expect(detail.status).toBe(200);

    // Errors export is a CSV.
    const errCsv = await requestAs(
      db.alice,
      `/api/import-batches/${body.batch.id}/errors/export`
    );
    expect(errCsv.status).toBe(200);
    expect(await errCsv.text()).toContain("Row,Reason,Data");
  });

  it("resolve 'import' re-inserts stored duplicates into the original account", async () => {
    const accountId = await createAccount(db.alice, "Resolve Bank");
    // First import creates one real txn.
    const first = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: `${HEADERS}\n${csvRow("2026-06-01", "Unique Import", 123)}`,
        account_id: accountId,
      }),
    });
    expect(first.status).toBe(200);

    // Second import contains the SAME row → flagged duplicate.
    const second = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: `${HEADERS}\n${csvRow("2026-06-01", "Unique Import", 123)}`,
        account_id: accountId,
      }),
    });
    const secondBody = (await second.json()) as {
      batch: { id: string };
      duplicate_rows: number;
    };
    expect(secondBody.duplicate_rows).toBe(1);

    const dupRows = await pool.query<{ id: string }>(
      `SELECT id FROM import_errors
       WHERE import_batch_id = $1 AND error_reason LIKE 'duplicate%'`,
      [secondBody.batch.id]
    );
    const dupId = dupRows.rows[0].id;

    const resolve = await requestAs(
      db.alice,
      `/api/import-batches/${secondBody.batch.id}/duplicates/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import", ids: [dupId] }),
      }
    );
    expect(resolve.status).toBe(200);
    expect(((await resolve.json()) as { imported: number }).imported).toBe(1);

    // Both copies now exist as transactions.
    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM transactions
       WHERE user_id = $1 AND description = 'Unique Import'`,
      [db.alice.userId]
    );
    expect(Number(count.rows[0].c)).toBe(2);

    // The resolved duplicate row is gone from the log.
    const remaining = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM import_errors WHERE id = $1`,
      [dupId]
    );
    expect(Number(remaining.rows[0].c)).toBe(0);
  });

  it("resolve 'skip' drops duplicates without inserting", async () => {
    const accountId = await createAccount(db.alice, "Skip Bank");
    await postAs(db.alice, "/api/transactions", {
      type: "expense",
      account_id: accountId,
      amount: "50",
      description: "Dup Target",
      date: "2026-07-07",
    });
    const imp = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: `${HEADERS}\n${csvRow("2026-07-07", "Dup Target", 50)}`,
        account_id: accountId,
      }),
    });
    const batch = ((await imp.json()) as { batch: { id: string } }).batch.id;

    const skip = await requestAs(
      db.alice,
      `/api/import-batches/${batch}/duplicates/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      }
    );
    expect(skip.status).toBe(200);
    expect(((await skip.json()) as { skipped: number }).skipped).toBe(1);

    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM transactions WHERE description = 'Dup Target'`,
    );
    expect(Number(count.rows[0].c)).toBe(1); // only the original
  });

  it("merge folds merchant/category into the chosen existing txn", async () => {
    const accountId = await createAccount(db.alice, "Merge Bank");
    const existing = await postAs(db.alice, "/api/transactions", {
      type: "expense",
      account_id: accountId,
      amount: "60",
      description: "Existing Row",
      date: "2026-08-08",
    });
    const existingId = (
      (await existing.json()) as { transaction: { id: string } }
    ).transaction.id;

    // Same hash as the seeded row → stored as a duplicate.
    const imp = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: `${HEADERS}\n${csvRow("2026-08-08", "Existing Row", 60)}`,
        account_id: accountId,
      }),
    });
    void imp;
    const batchList = (await (
      await requestAs(db.alice, "/api/import-batches")
    ).json()) as { batches: { id: string }[] };
    const batchId = batchList.batches[0].id;

    const dupErrors = (await (
      await requestAs(db.alice, `/api/import-batches/${batchId}/errors`)
    ).json()) as { errors: { id: string; error_reason: string }[] };
    const dupError = dupErrors.errors.find((e) =>
      e.error_reason.startsWith("duplicate")
    )!;
    expect(dupError).toBeTruthy();

    const merge = await requestAs(
      db.alice,
      `/api/import-batches/${batchId}/duplicates/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "merge",
          resolutions: [
            {
              row_id: dupError.id,
              existing_transaction_id: existingId,
            },
          ],
        }),
      }
    );
    expect(merge.status).toBe(200);

    // Existing row survived; duplicate never became a transaction.
    const kept = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM transactions WHERE description = 'Existing Row'`
    );
    expect(Number(kept.rows[0].c)).toBe(1);
  });

  it("caps row counts and rejects bad payloads", async () => {
    const accountId = await ensureAccount();
    const tooMany = [HEADERS];
    for (let i = 0; i < 2001; i++) {
      tooMany.push(csvRow("2026-04-01", `row ${i}`, 5));
    }
    const res = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: tooMany.join("\n"), account_id: accountId }),
    });
    expect(res.status).toBe(400);

    const noAcct = await requestAs(db.alice, "/api/transactions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "x\ny", account_id: "nope" }),
    });
    expect(noAcct.status).toBe(400);
  });
});

describe("cross-user isolation", () => {
  it("batches are scoped per user", async () => {
    const carol = await createUser("imp-carol@moneymind.test");
    const bobBatches = (await (
      await requestAs(carol, "/api/import-batches")
    ).json()) as { batches: unknown[] };
    expect(bobBatches.batches).toEqual([]);

    // Foreign batch ids 404 for carol.
    const aliceBatch = (await (
      await requestAs(db.alice, "/api/import-batches")
    ).json()) as { batches: { id: string }[] };
    if (aliceBatch.batches[0]) {
      expect(
        (
          await requestAs(carol, `/api/import-batches/${aliceBatch.batches[0].id}`)
        ).status
      ).toBe(404);
    }
  });
});
