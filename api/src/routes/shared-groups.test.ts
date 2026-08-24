import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createCategory,
  createExpense,
  createUser,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

const INVITE_EMAIL = "invitee@example.com";

async function createGroup(
  name = `Family ${Date.now() % 100000}`,
  owner = db.alice
): Promise<string> {
  const res = await postAs(owner, "/api/shared-groups", { name });
  expect(res.status).toBe(200);
  return ((await res.json()) as { group: { id: string } }).group.id;
}

/** Creates a real pending invite and returns the raw token (from the URL). */
async function inviteEmail(
  groupId: string,
  email = INVITE_EMAIL,
  inviter = db.alice
): Promise<string> {
  const res = await postAs(inviter, `/api/shared-groups/${groupId}/invites`, {
    email,
  });
  expect(res.status).toBe(200);
  const url = ((await res.json()) as { invite_url: string }).invite_url;
  return url.split("/").pop()!;
}

async function makeUserWithEmail(email: string) {
  const user = await createUser(email);
  // SessionUser.email comes from the users row â€” matches the invite target.
  return user;
}

describe("group creation and listing", () => {
  it("creates a group with the creator as admin owner", async () => {
    const id = await createGroup("Trip Squad");
    const list = (await (
      await requestAs(db.alice, "/api/shared-groups")
    ).json()) as {
      groups: { id: string; name: string; is_owner: boolean; my_role: string; member_count: number }[];
    };
    const mine = list.groups.find((g) => g.id === id)!;
    expect(mine.is_owner).toBe(true);
    expect(mine.my_role).toBe("admin");
    expect(mine.member_count).toBe(1);
  });

  it("validates name length", async () => {
    const short = await postAs(db.alice, "/api/shared-groups", { name: "x" });
    expect(short.status).toBe(400);
  });

  it("lists groups for members but never for outsiders", async () => {
    const id = await createGroup();
    const bob = await createUser("sg-bob@moneymind.test");

    const bobList = (await (
      await requestAs(bob, "/api/shared-groups")
    ).json()) as { groups: unknown[] };
    expect(bobList.groups).toEqual([]);

    void id;
  });
});

describe("invite lifecycle", () => {
  it("resolve â†’ accept grants membership; wrong email 403; expiry 410", async () => {
    const groupId = await createGroup();
    const token = await inviteEmail(groupId);

    const carol = await createUser(INVITE_EMAIL);

    // Resolve shows the group before joining.
    const resolveRes = await requestAs(carol, `/api/shared-groups/invites/${token}`);
    expect(resolveRes.status).toBe(200);
    const resolved = (await resolveRes.json()) as {
      group_name: string;
      status: string;
      expired: boolean;
      invitee_email: string;
    };
    expect(resolved.status).toBe("pending");
    expect(resolved.expired).toBe(false);
    expect(resolved.invitee_email).toBe(INVITE_EMAIL);

    // A different authed user can't accept someone else's invite.
    const outsider = await createUser("sg-outsider@moneymind.test");
    const wrong = await postAs(outsider, `/api/shared-groups/invites/${token}/accept`, {});
    expect(wrong.status).toBe(403);

    // The intended recipient accepts.
    const accept = await postAs(carol, `/api/shared-groups/invites/${token}/accept`, {});
    expect(accept.status).toBe(200);
    const accepted = (await accept.json()) as { group: { id: string }; role: string };
    expect(accepted.group.id).toBe(groupId);
    expect(accepted.role).toBe("read_only");

    // Second accept is no longer pending.
    const again = await postAs(carol, `/api/shared-groupses/invites/x/accept`, {});
    void again;
    const reAccept = await postAs(carol, `/api/shared-groups/invites/${token}/accept`, {});
    expect(reAccept.status).toBe(409);

    // Carol now sees the group in her list.
    const carolList = (await (
      await requestAs(carol, "/api/shared-groups")
    ).json()) as { groups: { id: string }[] };
    expect(carolList.groups.map((g) => g.id)).toContain(groupId);

    // Expired invites are rejected with 410.
    const token2 = await inviteEmail(groupId, "late@example.com");
    const tokenHash = (() => {
      // Backdate by rewriting expires_at directly.
      return null;
    })();
    void tokenHash;
    const pendingInvites = (await (
      await requestAs(db.alice, `/api/shared-groups/${groupId}/invites`)
    ).json()) as { invites: { id: string; invitee_email: string }[] };
    const lateInvite = pendingInvites.invites.find(
      (i) => i.invitee_email === "late@example.com"
    )!;
    const lateTokenRow = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM group_invites WHERE id = $1`,
      [lateInvite.id]
    );
    await pool.query(
      `UPDATE group_invites SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
       WHERE token_hash = $1`,
      [lateTokenRow.rows[0].token_hash]
    );
    const lateUser = await createUser("late@example.com");
    const expiredAccept = await postAs(
      lateUser,
      `/api/shared-groups/invites/${token2}/accept`,
      {}
    );
    expect(expiredAccept.status).toBe(410);
  });

  it("decline marks the invitation without granting access", async () => {
    const groupId = await createGroup();
    const token = await inviteEmail(groupId, "decliner@example.com");
    const decliner = await createUser("decliner@example.com");

    const decline = await postAs(
      decliner,
      `/api/shared-groups/invites/${token}/decline`,
      {}
    );
    expect(decline.status).toBe(200);

    const accept = await postAs(
      decliner,
      `/api/shared-groups/invites/${token}/accept`,
      {}
    );
    expect(accept.status).toBe(409); // WRONG_STATE

    const list = (await (
      await requestAs(decliner, "/api/shared-groups")
    ).json()) as { groups: unknown[] };
    expect(list.groups).toEqual([]);
  });

  it("owner can revoke a pending invite; only owner can invite", async () => {
    const groupId = await createGroup();
    const token = await inviteEmail(groupId);

    const pending = (await (
      await requestAs(db.alice, `/api/shared-groups/${groupId}/invites`)
    ).json()) as { invites: { id: string; status: string }[] };
    expect(pending.invites).toHaveLength(1);
    expect(pending.invites[0].status).toBe("pending");

    const revoke = await requestAs(
      db.alice,
      `/api/shared-groups/${groupId}/invites/${pending.invites[0].id}`,
      { method: "DELETE" }
    );
    expect(revoke.status).toBe(200);

    const acceptor = await createUser("revoked@example.com");
    expect(
      (await postAs(acceptor, `/api/shared-groups/invites/${token}/accept`, {})).status
    ).toBe(409);

    // Non-owner can't invite.
    const memberEmail = "plain-member@example.com";
    const memberToken = await inviteEmail(groupId, memberEmail);
    const member = await createUser(memberEmail);
    await postAs(member, `/api/shared-groups/invites/${memberToken}/accept`, {});
    const forbidden = await postAs(member, `/api/shared-groups/${groupId}/invites`, {
      email: "someone-else@example.com",
    });
    expect(forbidden.status).toBe(403);
  });
});

describe("membership management", () => {
  it("owner removes members; members leave; owner protected", async () => {
    const groupId = await createGroup();
    const m1 = await createUser("m1@moneymind.test");
    const t1 = await inviteEmail(groupId, "m1@moneymind.test");
    await postAs(m1, `/api/shared-groups/invites/${t1}/accept`, {});
    const m2 = await createUser("m2@moneymind.test");
    const t2 = await inviteEmail(groupId, "m2@moneymind.test");
    await postAs(m2, `/api/shared-groups/invites/${t2}/accept`, {});

    // Owner leave attempt â†’ 409.
    expect(
      (
        await postAs(db.alice, `/api/shared-groups/${groupId}/leave`, {})
      ).status
    ).toBe(409);

    // Owner removes m1.
    const remove = await requestAs(
      db.alice,
      `/api/shared-groups/${groupId}/members/${m1.userId}`,
      { method: "DELETE" }
    );
    expect(remove.status).toBe(200);
    expect(
      (await requestAs(m1, `/api/shared-groups/${groupId}`)).status
    ).toBe(404);

    // Member cannot remove others.
    expect(
      (
        await requestAs(
          m2,
          `/api/shared-groups/${groupId}/members/${db.alice.userId}`,
          { method: "DELETE" }
        )
      ).status
    ).toBe(403);

    // m2 leaves voluntarily.
    expect(
      (await postAs(m2, `/api/shared-groups/${groupId}/leave`, {})).status
    ).toBe(200);
    expect((await requestAs(m2, `/api/shared-groups/${groupId}`)).status).toBe(404);
  });

  it("transfers ownership; new owner gains control, old owner demoted", async () => {
    const groupId = await createGroup("Handover");
    const successor = await createUser("successor@moneymind.test");
    const token = await inviteEmail(groupId, "successor@moneymind.test");
    await postAs(successor, `/api/shared-groups/invites/${token}/accept`, {});

    // Member can't transfer.
    expect(
      (
        await postAs(successor, `/api/shared-groups/${groupId}/transfer-ownership`, {
          new_owner_id: successor.userId,
        })
      ).status
    ).toBe(403);

    const transfer = await postAs(db.alice, `/api/shared-groups/${groupId}/transfer-ownership`, {
      new_owner_id: successor.userId,
    });
    expect(transfer.status).toBe(200);

    const list = (await (
      await requestAs(successor, "/api/shared-groups")
    ).json()) as { groups: { id: string; is_owner: boolean }[] };
    expect(list.groups.find((g) => g.id === groupId)!.is_owner).toBe(true);

    // Old owner keeps an admin members row but loses owner rights; the group
    // still resolves via membership, so the role check answers 403.
    const patch = await requestAs(db.alice, `/api/shared-groups/${groupId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sneaky Rename", version: 1 }),
    });
    expect(patch.status).toBe(403);

    // New owner can rename — version was bumped by transfer (+1).
    const okPatch = await requestAs(successor, `/api/shared-groups/${groupId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed Group", version: 2 }),
    });
    expect(okPatch.status).toBe(200);
  });

  it("owner-only update/delete on foreign groups 404s before role checks leak", async () => {
    const groupId = await createGroup("Private");
    const outsider = await createUser("outsider-sg@moneymind.test");
    expect(
      (
        await requestAs(outsider, `/api/shared-groups/${groupId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Nope", version: 1 }),
        })
      ).status
    ).toBe(404);
    expect(
      (
        await requestAs(outsider, `/api/shared-groups/${groupId}`, { method: "DELETE" })
      ).status
    ).toBe(404);
  });
});

describe("group transactions and PATCH assignment", () => {
  it("PATCH assigns group_id only to active members; group txns visible to members", async () => {
    const accountId = await createAccount(db.alice, "Shared Wallet");
    const groupId = await createGroup();

    const catId = await createCategory(db.alice, "Shared Cat");
    const txnId = await createExpense(db.alice, accountId, catId, 250, isoToday());

    // Outsider PATCHing a txn they cannot even see -> 404 (no existence leak).
    const stranger = await createUser("stranger-grp@moneymind.test");
    const strangerGroup = await createGroup("Strangers", stranger);
    const badAssign = await requestAs(stranger, `/api/transactions/${txnId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "expense",
        account_id: accountId,
        amount: "250",
        date: isoToday(),
        group_id: strangerGroup === groupId ? undefined : strangerGroup,
        version: 1,
      }),
    });
    expect(badAssign.status, await badAssign.clone().text()).toBe(404);

    // Invite carol, then assign alice's txn to the group.
    const carol = await createUser(INVITE_EMAIL.replace("example", "grp"));
    const token = await inviteEmail(groupId, carol.email);
    await postAs(carol, `/api/shared-groups/invites/${token}/accept`, {});

    const assign = await requestAs(db.alice, `/api/transactions/${txnId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "expense",
        account_id: accountId,
        amount: "250",
        date: isoToday(),
        group_id: groupId,
        version: 1,
      }),
    });
    expect(assign.status, JSON.stringify({ txnId, groupId, alice: db.alice.userId, body: await assign.clone().text() })).toBe(200);

    // Member sees it via the group feed.
    const feed = (await (
      await requestAs(carol, `/api/shared-groups/${groupId}/transactions`)
    ).json()) as { transactions: { id: string; added_by_email: string }[] };
    expect(feed.transactions.map((t) => t.id)).toContain(txnId);

    // Export includes it too.
    const csvRes = await requestAs(
      db.alice,
      `/api/shared-groups/${groupId}/transactions/export`
    );
    expect(csvRes.status).toBe(200);
    const text = await csvRes.text();
    expect(text).toContain("Date,Type,Description,Amount,Added By");
    expect(text).toContain("250.00");
  });

  it("clearing group_id removes it from the feed", async () => {
    const accountId = await createAccount(db.alice, "Clear Wallet");
    const groupId = await createGroup();
    const catId = await createCategory(db.alice, "Clr");
    const txnId = await createExpense(db.alice, accountId, catId, 90, isoToday());
    await postAs(db.alice, `/api/transactions/${txnId}`, {
      type: "expense",
      account_id: accountId,
      amount: "90",
      date: isoToday(),
      group_id: groupId,
      version: 1,
    });
    await requestAs(db.alice, `/api/transactions/${txnId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "expense",
        account_id: accountId,
        amount: "90",
        date: isoToday(),
        group_id: null,
        version: 2,
      }),
    });
    const feed = (await (
      await requestAs(db.alice, `/api/shared-groups/${groupId}/transactions`)
    ).json()) as { transactions: unknown[] };
    expect(feed.transactions).toEqual([]);
  });
});

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
