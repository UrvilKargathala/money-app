"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createAccount(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const opening_balance = formData.get("opening_balance") ? String(formData.get("opening_balance")) : "0";
  const credit_limit = formData.get("credit_limit") ? String(formData.get("credit_limit")) : null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/accounts", {
    method: "POST",
    json: { name, type, institution, opening_balance, credit_limit, color, notes },
  });
  const body = await res.json();
  if (!res.ok) {
    return { error: body.error, fieldErrors: body.fieldErrors };
  }
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { success: true };
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

  const res = await apiFetchRaw(`/api/accounts/${id}`, {
    method: "PATCH",
    json: { name, type, institution, color, notes, credit_limit, version },
  });
  const body = await res.json();
  if (!res.ok) {
    return { error: body.error, fieldErrors: body.fieldErrors };
  }
  revalidatePath("/accounts");
  return { success: true };
}

export async function deactivateAccountAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/accounts/${id}/deactivate`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not deactivate." };
  revalidatePath("/accounts");
  return { success: true };
}

export async function reactivateAccountAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/accounts/${id}/reactivate`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not reactivate." };
  revalidatePath("/accounts");
  return { success: true };
}

export async function deleteAccountAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/accounts/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/accounts");
  return { success: true };
}

export async function createTransfer(prev: ActionState, formData: FormData): Promise<ActionState> {
  const from_account_id = String(formData.get("from_account_id") ?? "");
  const to_account_id = String(formData.get("to_account_id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!from_account_id || !to_account_id) return { fieldErrors: { from_account_id: "Select both accounts." } };
  if (from_account_id === to_account_id) return { fieldErrors: { to_account_id: "Choose a different account." } };
  if (!amount || Number(amount) <= 0) return { fieldErrors: { amount: "Enter a valid amount." } };

  const res = await apiFetchRaw("/api/transfers", {
    method: "POST",
    json: { from_account_id, to_account_id, amount, date, notes },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { success: true };
}
