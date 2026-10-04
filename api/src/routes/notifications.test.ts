import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createUser,
  fixtureDb,
  patchAs,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function insertNotification(
  userId: number,
  overrides: Partial<{
    type: string;
    module: string;
    title: string;
    message: string;
    priority: string;
    is_read: number;
    is_dismissed: number;
    deep_link: string;
  }> = {}
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO notifications
       (user_id, type, module, title, message, priority, is_read, is_dismissed,
        deep_link, data_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING id`,
    [
      userId,
      overrides.type ?? "info",
      overrides.module ?? "system",
      overrides.title ?? "Test notification",
      overrides.message ?? "Test message body",
      overrides.priority ?? "medium",
      overrides.is_read ?? 0,
      overrides.is_dismissed ?? 0,
      overrides.deep_link ?? null,
      JSON.stringify({ key: "value" }),
    ]
  );
  return result.rows[0].id;
}

describe("notification feed and badge count", () => {
  it("lists unread by default with pagination; excludes dismissed", async () => {
    const id1 = await insertNotification(db.alice.userId, { title: "Unread One" });
    await insertNotification(db.alice.userId, { title: "Read One", is_read: 1 });
    await insertNotification(db.alice.userId, { title: "Dismissed", is_dismissed: 1 });

    const res = await requestAs(db.alice, "/api/notifications?filter=unread");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      notifications: { id: string; title: string; is_read: number }[];
      total: number;
    };
    expect(body.notifications.map((n) => n.id)).toEqual([id1]);
    expect(body.total).toBe(1);

    // All filter includes the read one but not dismissed.
    const all = (await (
      await requestAs(db.alice, "/api/notifications?filter=all")
    ).json()) as { notifications: unknown[] };
    expect(all.notifications).toHaveLength(2);

    // Badge count.
    const count = (await (
      await requestAs(db.alice, "/api/notifications/unread-count")
    ).json()) as { unread_count: number };
    expect(count.unread_count).toBe(1);
  });

  it("type and module filters narrow results", async () => {
    await insertNotification(db.alice.userId, { type: "warning", title: "Warn" });
    await insertNotification(db.alice.userId, { type: "insight", title: "Insight" });

    const res = await requestAs(db.alice, "/api/notifications?type=warning");
    const body = (await res.json()) as {
      notifications: { type: string }[];
    };
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe("warning");
  });
});

describe("mark read/dismiss/restore lifecycle", () => {
  it("marks one read then all read; dismiss + restore cycle", async () => {
    const n1 = await insertNotification(db.alice.userId, { title: "N1" });
    const n2 = await insertNotification(db.alice.userId, { title: "N2" });

    // Mark one read.
    expect(
      (await postAs(db.alice, `/api/notifications/${n1}/read`, {})).status
    ).toBe(200);
    // Already read → 404.
    expect(
      (await postAs(db.alice, `/api/notifications/${n1}/read`, {})).status
    ).toBe(404);

    // Dismiss n2.
    expect(
      (await postAs(db.alice, `/api/notifications/${n2}/dismiss`, {})).status
    ).toBe(200);

    let count = (await (
      await requestAs(db.alice, "/api/notifications/unread-count")
    ).json()) as { unread_count: number };
    expect(count.unread_count).toBe(0); // n1 read + n2 dismissed

    // Restore n2 back to feed.
    const restore = await postAs(db.alice, `/api/notifications/${n2}/restore`, {});
    expect(restore.status).toBe(200);
    count = (await (
      await requestAs(db.alice, "/api/notifications/unread-count")
    ).json()) as typeof count;
    expect(count.unread_count).toBe(1); // n2 restored as unread

    // Mark ALL read clears everything.
    expect(
      (await postAs(db.alice, "/api/notifications/read-all", {})).status
    ).toBe(200);
    count = (await (
      await requestAs(db.alice, "/api/notifications/unread-count")
    ).json()) as typeof count;
    expect(count.unread_count).toBe(0);
  });

  it("bulk read and bulk dismiss in one call", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await insertNotification(db.alice.userId, { title: `Bulk ${i}` }));
    }

    const dismissRes = await postAs(db.alice, "/api/notifications/bulk", {
      action: "dismiss",
      ids: ids.slice(0, 3),
    });
    expect(dismissRes.status).toBe(200);
    expect(((await dismissRes.json()) as { affected: number }).affected).toBe(3);

    const readRes = await postAs(db.alice, "/api/notifications/bulk", {
      action: "read",
      ids: ids.slice(3),
    });
    expect(readRes.status).toBe(200);
    expect(((await readRes.json()) as { affected: number }).affected).toBe(2);
  });
});

describe("action deep-link", () => {
  it("returns deep_link and marks read on action", async () => {
    const id = await insertNotification(db.alice.userId, {
      title: "Bill due",
        deep_link: "/money/bills",
    });

    const res = await postAs(db.alice, `/api/notifications/${id}/action`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deep_link: string | null;
      data_payload: Record<string, unknown> | null;
    };
      expect(body.deep_link).toBe("/money/bills");
    expect(body.data_payload).toEqual({ key: "value" });

    // Action marks read.
    const count = (await (
      await requestAs(db.alice, "/api/notifications/unread-count")
    ).json()) as { unread_count: number };
    expect(count.unread_count).toBe(0);
  });
});

describe("archive search", () => {
  it("finds notifications including dismissed via ILIKE", async () => {
    await insertNotification(db.alice.userId, {
      title: "Unique Searchable Title",
      is_dismissed: 1,
    });
    await insertNotification(db.alice.userId, { title: "Other Item" });

    const res = await requestAs(
      db.alice,
      "/api/notifications/archive?search=unique+searchable"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      archive: { title: string }[];
    };
    expect(body.archive).toHaveLength(1);
    expect(body.archive[0].title).toBe("Unique Searchable Title");
  });
});

describe("stream endpoint", () => {
  it("returns latest since a timestamp", async () => {
    await insertNotification(db.alice.userId, { title: "Stream Test" });
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await requestAs(
      db.alice,
      `/api/notifications/stream?since=${encodeURIComponent(past)}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      latest_server_time: string;
      notifications: { title: string }[];
    };
    expect(body.latest_server_time).toBeTruthy();
    expect(body.notifications.length).toBeGreaterThan(0);
  });
});

describe("notification preferences matrix", () => {
  it("defaults: in_app enabled, email disabled for all types", async () => {
    const res = await requestAs(db.alice, "/api/notification-preferences");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preferences: { notification_type: string; channel: string; is_enabled: boolean }[];
    };
    // 6 types × 2 channels = 12 cells.
    expect(body.preferences).toHaveLength(12);
    const inAppWarning = body.preferences.find(
      (p) => p.notification_type === "warning" && p.channel === "in_app"
    )!;
    expect(inAppWarning.is_enabled).toBe(true);
    const emailWarning = body.preferences.find(
      (p) => p.notification_type === "warning" && p.channel === "email"
    )!;
    expect(emailWarning.is_enabled).toBe(false);
  });

  it("bulk upsert persists toggles", async () => {
    const patch = await requestAs(db.alice, "/api/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preferences: [
          { notification_type: "alert", channel: "email", is_enabled: true },
          { notification_type: "summary", channel: "in_app", is_enabled: false },
        ],
      }),
    });
    expect(patch.status).toBe(200);

    const after = (await (
      await requestAs(db.alice, "/api/notification-preferences")
    ).json()) as {
      preferences: { notification_type: string; channel: string; is_enabled: boolean }[];
    };
    const alertEmail = after.preferences.find(
      (p) => p.notification_type === "alert" && p.channel === "email"
    )!;
    expect(alertEmail.is_enabled).toBe(true);
    const summaryInApp = after.preferences.find(
      (p) => p.notification_type === "summary" && p.channel === "in_app"
    )!;
    expect(summaryInApp.is_enabled).toBe(false);
  });

  it("single toggle flips one cell", async () => {
    const toggle = await requestAs(
      db.alice,
      "/api/notification-preferences/info/in_app",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(toggle.status).toBe(200);
    expect(((await toggle.json()) as { is_enabled: boolean }).is_enabled).toBe(false);

    const toggleBack = await requestAs(
      db.alice,
      "/api/notification-preferences/info/in_app",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(((await toggleBack.json()) as { is_enabled: boolean }).is_enabled).toBe(true);
  });
});

describe("email delivery log", () => {
  it("returns empty array when no emails sent", async () => {
    const res = await requestAs(db.alice, "/api/notification-emails");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { emails: unknown[] }).emails).toEqual([]);
  });
});

describe("email entitlement coherence (display vs enforcement)", () => {
  async function setPlan(
    userId: number,
    plan: "free" | "premium",
    ageDays: number
  ): Promise<void> {
    if (plan === "free") {
      await pool.query(
        `UPDATE users SET plan_type = 'free', billing_cycle = NULL,
           premium_expires_at = NULL, legacy_member_number = NULL,
           created_at = CURRENT_TIMESTAMP - ($2 || ' days')::interval
         WHERE user_id = $1`,
        [userId, ageDays]
      );
    } else {
      await pool.query(
        `UPDATE users SET plan_type = 'premium', billing_cycle = 'annual',
           premium_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 year',
           legacy_member_number = NULL,
           created_at = CURRENT_TIMESTAMP - ($2 || ' days')::interval
         WHERE user_id = $1`,
        [userId, ageDays]
      );
    }
  }

  async function seedEmailPref(userId: number, enabled: number): Promise<void> {
    await pool.query(
      `INSERT INTO notification_preferences (user_id, notification_type, channel, is_enabled)
       VALUES ($1, 'info', 'email', $2)
       ON CONFLICT (user_id, notification_type, channel)
       DO UPDATE SET is_enabled = $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, enabled]
    );
  }

  /**
   * The seeded catalog grants email to every tier (002's deliberate
   * pre-launch open door), so locked-branch tests must restrict the free row
   * explicitly and restore it afterwards. Do NOT "fix" this by changing the
   * seed: flipping the catalog enables all paywalls everywhere.
   */
  async function restrictFreeEmail(): Promise<() => Promise<void>> {
    const prev = await pool.query<{
      allowed: number;
      limit_value: string | null;
      mode: string | null;
    }>(
      `SELECT allowed, limit_value::text AS limit_value, mode
       FROM plan_entitlements WHERE plan_code = 'free' AND feature_key = 'notifications_email'`
    );
    await pool.query(
      `UPDATE plan_entitlements SET allowed = 0, limit_value = NULL, mode = 'in_app'
       WHERE plan_code = 'free' AND feature_key = 'notifications_email'`
    );
    const row = prev.rows[0];
    return async () => {
      await pool.query(
        `UPDATE plan_entitlements SET allowed = $1, limit_value = $2::int, mode = $3
         WHERE plan_code = 'free' AND feature_key = 'notifications_email'`,
        [row.allowed, row.limit_value, row.mode]
      );
    };
  }

  type PrefsBody = {
    preferences: { notification_type: string; channel: string; is_enabled: boolean }[];
    emailLocked: boolean;
  };

  async function emailCell(): Promise<{ on: boolean; locked: boolean }> {
    const res = await requestAs(db.alice, "/api/notification-preferences");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PrefsBody;
    const cell = body.preferences.find(
      (p) => p.notification_type === "info" && p.channel === "email"
    );
    return { on: cell?.is_enabled ?? false, locked: body.emailLocked };
  }

  it("trial user: email toggle ON persists (no display revert)", async () => {
    await setPlan(db.alice.userId, "free", 0);
    const toggle = await patchAs(
      db.alice,
      "/api/notification-preferences/info/email",
      {}
    );
    expect(toggle.status).toBe(200);
    expect(((await toggle.json()) as { is_enabled: boolean }).is_enabled).toBe(
      true
    );
    // The follow-up read must agree with the write (the BUG-115 revert).
    expect(await emailCell()).toEqual({ on: true, locked: false });
  });

  it("legacy premium past trial: email toggle ON works", async () => {
    await setPlan(db.alice.userId, "premium", 40);
    const toggle = await patchAs(
      db.alice,
      "/api/notification-preferences/info/email",
      {}
    );
    expect(toggle.status).toBe(200);
    expect(await emailCell()).toEqual({ on: true, locked: false });
  });

  it("free user: stored-ON email can always be turned OFF, never ON", async () => {
    await setPlan(db.alice.userId, "free", 40);
    const restoreCatalog = await restrictFreeEmail();
    try {
      await seedEmailPref(db.alice.userId, 1);
      const off = await patchAs(
        db.alice,
        "/api/notification-preferences/info/email",
        {}
      );
      expect(off.status).toBe(200);
      expect(((await off.json()) as { is_enabled: boolean }).is_enabled).toBe(false);
      expect(await emailCell()).toEqual({ on: false, locked: true });
      const on = await patchAs(
        db.alice,
        "/api/notification-preferences/info/email",
        {}
      );
      expect(on.status).toBe(403);
      expect(((await on.json()) as { error: string }).error).toBe("plan_locked");
    } finally {
      await restoreCatalog();
    }
  });

  it("free user with no stored rows: email reads locked-off", async () => {
    await setPlan(db.alice.userId, "free", 40);
    const restoreCatalog = await restrictFreeEmail();
    try {
      expect(await emailCell()).toEqual({ on: false, locked: true });
    } finally {
      await restoreCatalog();
    }
  });
});

describe("cross-user isolation", () => {
  it("notifications are scoped per user; foreign ids 404", async () => {
    const aliceNotif = await insertNotification(db.alice.userId, { title: "Alice Only" });

    const bobList = (await (
      await requestAs(db.bob, "/api/notifications")
    ).json()) as { notifications: unknown[] };
    expect(bobList.notifications).toEqual([]);

    expect(
      (await requestAs(db.bob, `/api/notifications/${aliceNotif}`)).status
    ).toBe(404);
    expect(
      (await postAs(db.bob, `/api/notifications/${aliceNotif}/read`, {})).status
    ).toBe(404);
    expect(
      (await postAs(db.bob, `/api/notifications/${aliceNotif}/action`, {})).status
    ).toBe(404);
  });
});
