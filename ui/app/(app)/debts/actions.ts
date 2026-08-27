"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createDebt(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "personal_loan");
  const principal_original = String(formData.get("principal_original") ?? "");
  const principal_outstanding = String(formData.get("principal_outstanding") ?? principal_original);
  const interest_rate = String(formData.get("interest_rate") ?? "");
  const emi_amount = String(formData.get("emi_amount") ?? "");
  const tenure_months = String(formData.get("tenure_months") ?? "");
  const start_date = String(formData.get("start_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;

  const res = await apiFetchRaw("/api/debts", {
    method: "POST",
    json: { name, type, principal_original, principal_outstanding, interest_rate, emi_amount, tenure_months, start_date, account_id },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/debts");
  return { success: true };
}

export async function updateDebt(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const interest_rate = String(formData.get("interest_rate") ?? "");
  const emi_amount = String(formData.get("emi_amount") ?? "");
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/debts/${id}`, {
    method: "PATCH",
    json: { name, interest_rate, emi_amount, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/debts");
  return { success: true };
}

export async function deleteDebtAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/debts/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete debt." };
  revalidatePath("/debts");
  return { success: true };
}

export async function closeDebtAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/debts/${id}/close`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not close debt." };
  revalidatePath("/debts");
  return { success: true };
}

export async function reopenDebtAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/debts/${id}/reopen`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not reopen." };
  revalidatePath("/debts");
  return { success: true };
}

export async function logPayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const notes = String(formData.get("notes") ?? "") || undefined;
  const transaction_id = String(formData.get("transaction_id") ?? "") || undefined;
  const link_transaction = formData.get("link_transaction") === "true" || formData.get("link_transaction") === "1";

  const json: Record<string, unknown> = { date };
  if (amount) json.amount = amount;
  if (notes) json.notes = notes;
  if (transaction_id) json.transaction_id = transaction_id;
  if (link_transaction) json.link_transaction = true;

  const res = await apiFetchRaw(`/api/debts/${debtId}/payments`, { method: "POST", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/debts");
  return { success: true };
}

export async function updatePayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const notes = String(formData.get("notes") ?? "");

  const json: Record<string, unknown> = {};
  if (amount) json.amount = amount;
  if (date) json.date = date;
  if (notes !== "") json.notes = notes;

  const res = await apiFetchRaw(`/api/debts/${debtId}/payments/${paymentId}`, { method: "PATCH", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/debts");
  return { success: true };
}

export async function deletePaymentAction(debtId: string, paymentId: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/debts/${debtId}/payments/${paymentId}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete payment." };
  revalidatePath("/debts");
  return { success: true };
}

export async function applyPrepayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const notes = String(formData.get("notes") ?? "") || undefined;

  const res = await apiFetchRaw(`/api/debts/${debtId}/prepayments`, { method: "POST", json: { amount, date, notes } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/debts");
  return { success: true };
}

export async function simulatePrepayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const strategy = String(formData.get("strategy") ?? "reduce_tenure");

  const res = await apiFetchRaw(`/api/debts/${debtId}/simulate-prepayment`, { method: "POST", json: { amount, strategy } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  // simulate does not mutate, but revalidate to keep consistency
  revalidatePath("/debts");
  return { success: true };
}

export async function updateMonthlyIncome(prev: ActionState, formData: FormData): Promise<ActionState> {
  const monthly_income = String(formData.get("monthly_income") ?? formData.get("monthlyIncome") ?? "");
  const value = monthly_income.trim() === "" ? null : monthly_income;
  const res = await apiFetchRaw("/api/users/me/settings/monthly-income", {
    method: "PATCH",
    json: { monthly_income: value },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/debts");
  return { success: true };
}

export async function regenerateAmortization(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const res = await apiFetchRaw(`/api/debts/${debtId}/amortization/regenerate`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not regenerate schedule." };
  revalidatePath("/debts");
  return { success: true };
}
