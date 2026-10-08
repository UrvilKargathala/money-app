"use server";

import { todayLocalISO } from "@/lib/format";
import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createAccount(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const opening_balance = formData.get("opening_balance") ? String(formData.get("opening_balance")) : "0";
  const credit_limit = formData.get("credit_limit") ? String(formData.get("credit_limit")) : null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/accounts", {
    method: "POST",
    json: { name, type, institution, opening_balance, credit_limit, color, notes },
    fallback: "Could not save account.",
    revalidate: ["/money/accounts", "/overview/dashboard"],
  });
}

export async function updateAccount(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const credit_limit = formData.get("credit_limit") ? String(formData.get("credit_limit")) : null;
  const version = formData.get("version") ? Number(formData.get("version")) : 1;
  const type = String(formData.get("type") ?? "");

  return mutateAndRevalidate(`/api/accounts/${id}`, {
    method: "PATCH",
    json: { name, type, institution, color, notes, credit_limit, version },
    fallback: "Could not save account.",
    revalidate: ["/money/accounts"],
  });
}

export async function deactivateAccountAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/accounts/${id}/deactivate`, {
    method: "POST",
    json: {},
    fallback: "Could not deactivate.",
    revalidate: ["/money/accounts"],
  });
}

export async function reactivateAccountAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/accounts/${id}/reactivate`, {
    method: "POST",
    json: {},
    fallback: "Could not reactivate.",
    revalidate: ["/money/accounts"],
  });
}

export async function deleteAccountAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/accounts/${id}`, {
    method: "DELETE",
    fallback: "Could not delete.",
    revalidate: ["/money/accounts"],
  });
}

export async function createTransfer(prev: ActionState, formData: FormData): Promise<ActionState> {
  const from_account_id = String(formData.get("from_account_id") ?? "");
  const to_account_id = String(formData.get("to_account_id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? todayLocalISO());
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!from_account_id || !to_account_id) return { fieldErrors: { from_account_id: "Select both accounts." } };
  if (from_account_id === to_account_id) return { fieldErrors: { to_account_id: "Choose a different account." } };
  if (!amount || Number(amount) <= 0) return { fieldErrors: { amount: "Enter a valid amount." } };

  return mutateAndRevalidate("/api/transfers", {
    method: "POST",
    json: { from_account_id, to_account_id, amount, date, notes },
    fallback: "Could not save transfer.",
    revalidate: ["/money/accounts", "/overview/dashboard"],
  });
}
