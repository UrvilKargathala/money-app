"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, MailPlus, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type SharedGroup = {
  id: string;
  name: string;
  description: string | null;
  owner_id: number;
  is_owner: boolean;
  my_role: "admin" | "read_only" | null;
  member_count: number;
  version: number;
};
type Member = {
  user_id: number;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  is_owner: boolean;
};
type Invite = { id: string; invitee_email: string; status: string; expires_at: string };
type Transaction = {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  type: string;
  added_by_email: string;
};

async function json(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
  return body;
}

export function SharedGroupsDashboard({ initialGroups }: { initialGroups: SharedGroup[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialGroups[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const group = useMemo(() => initialGroups.find((candidate) => candidate.id === selected), [initialGroups, selected]);
  const visibleTransactions = useMemo(() => transactions.slice(0, 20), [transactions]);
  async function reloadDetails(id = selected) {
    if (!id) return;
    const [membersRes, invitesRes, transactionsRes] = await Promise.all([
      json(`/api/shared-groups/${id}/members`),
      group?.is_owner ? json(`/api/shared-groups/${id}/invites`) : Promise.resolve({ invites: [] }),
      json(`/api/shared-groups/${id}/transactions`),
    ]);
    setMembers(membersRes.members ?? []);
    setInvites(invitesRes.invites ?? []);
    setTransactions(transactionsRes.transactions ?? []);
  }
  useEffect(() => {
    reloadDetails().catch((error) => setMessage(error.message));
  }, [selected]);
  async function action(path: string, init: RequestInit, success: string) {
    try {
      setMessage("");
      await json(path, init);
      setMessage(success);
      router.refresh();
      await reloadDetails();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Shared finance"
        description="Collaborate with trusted people while keeping ownership and permissions clear."
      />
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Create a group</CardTitle>
              <CardDescription>For a household, trip, project, or shared goal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
              <Button
                className="w-full"
                onClick={async () => {
                  if (!name.trim()) return;
                  await action(
                    "/api/shared-groups",
                    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) },
                    "Group created."
                  );
                  setName("");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create group
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Your groups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {initialGroups.length === 0 && <p className="text-sm text-faint">Create your first shared group.</p>}
              {initialGroups.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelected(candidate.id)}
                  className={`w-full rounded-xl border border-edge bg-base p-3 text-left ${selected === candidate.id ? "border-primary-500 bg-info-soft dark:border-[#60A5FA] dark:bg-[#1E1E1E]/50" : "hover:bg-deep"}`}
                >
                  <div className="font-medium">{candidate.name}</div>
                  <div className="text-xs text-faint">
                    {candidate.member_count} members · {candidate.is_owner ? "Owner" : candidate.my_role}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
        {!group ? (
          <Card>
            <CardContent className="py-16 text-center text-faint">
              <Users className="mx-auto mb-3 h-8 w-8" />
              Select or create a group.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{group.name}</CardTitle>
                    <CardDescription>{group.description || "Shared money activity and members"}</CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/shared-groups/${group.id}/transactions/export`}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </a>
                  </Button>
                </div>
              </CardHeader>
              {message && (
                <CardContent>
                  <p role="status" className="rounded-lg bg-deep p-3 text-sm">
                    {message}
                  </p>
                </CardContent>
              )}
            </Card>
            {group.is_owner && (
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Invite a member</CardTitle>
                  <CardDescription>The invitation is emailed and expires in seven days.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="person@example.com"
                  />
                  <Button
                    onClick={async () => {
                      await action(
                        `/api/shared-groups/${group.id}/invites`,
                        {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ email }),
                        },
                        "Invitation sent."
                      );
                      setEmail("");
                    }}
                  >
                    <MailPlus className="mr-2 h-4 w-4" />
                    Invite
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Members</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {members.map((member) => (
                    <div key={member.user_id} className="flex items-center justify-between gap-2 py-3">
                      <div>
                        <p className="text-sm font-medium">{member.full_name || member.email}</p>
                        <p className="text-xs text-faint">
                          {member.is_owner ? "Owner" : member.role === "admin" ? "Can manage" : "View only"}
                        </p>
                      </div>
                      {group.is_owner && !member.is_owner && (
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Permission for ${member.email}`}
                            value={member.role}
                            onChange={(event) =>
                              action(
                                `/api/shared-groups/${group.id}/members/${member.user_id}`,
                                {
                                  method: "PATCH",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ role: event.target.value }),
                                },
                                "Permission updated."
                              )
                            }
                            className="h-8 rounded-md border bg-base px-2 text-xs"
                          >
                            <option value="admin">Can manage</option>
                            <option value="read_only">View only</option>
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              action(
                                `/api/shared-groups/${group.id}/members/${member.user_id}`,
                                { method: "DELETE" },
                                "Member removed."
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Pending invitations</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {invites.length === 0 && <p className="text-sm text-faint">No pending invitations.</p>}
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{invite.invitee_email}</p>
                        <p className="text-xs text-faint">Expires {new Date(invite.expires_at).toLocaleDateString()}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          action(
                            `/api/shared-groups/${group.id}/invites/${invite.id}`,
                            { method: "DELETE" },
                            "Invitation revoked."
                          )
                        }
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Shared transactions</CardTitle>
                <CardDescription>Transactions assigned to this group appear here.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                {transactions.length === 0 && (
                  <EmptyState
                    title="No shared transactions yet"
                    description="Transactions assigned to this group appear here."
                  />
                )}
                {visibleTransactions.map((txn) => (
                  <div key={txn.id} className="flex justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{txn.description || "Transaction"}</p>
                      <p className="text-xs text-faint">
                        {txn.date} · {txn.added_by_email}
                      </p>
                    </div>
                    <span className={txn.type === "income" ? "text-emerald-600" : "text-foreground"}>
                      {txn.type === "income" ? "+" : "-"}₹{Number(txn.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
