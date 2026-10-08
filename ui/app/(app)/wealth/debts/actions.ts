"use server";

import { todayLocalISO } from "@/lib/format";
import { mutateAndRevalidate } from "@/lib/server-action";
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

  return mutateAndRevalidate("/api/debts", {
    method: "POST",
    json: { name, type, principal_original, principal_outstanding, interest_rate, emi_amount, tenure_months, start_date, account_id },
    fallback: "Could not save debt.",
    revalidate: ["/wealth/debts"],
  });
}

export async function updateDebt(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const interest_rate = String(formData.get("interest_rate") ?? "");
  const emi_amount = String(formData.get("emi_amount") ?? "");
  const version = Number(formData.get("version") ?? 1);

  return mutateAndRevalidate(`/api/debts/${id}`, {
    method: "PATCH",
    json: { name, interest_rate, emi_amount, version },
    fallback: "Could not save debt.",
    revalidate: ["/wealth/debts"],
  });
}

export async function deleteDebtAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/debts/${id}`, {
    method: "DELETE",
    fallback: "Could not delete debt.",
    revalidate: ["/wealth/debts"],
  });
}

export async function closeDebtAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/debts/${id}/close`, {
    method: "POST",
    json: {},
    fallback: "Could not close debt.",
    revalidate: ["/wealth/debts"],
  });
}

export async function reopenDebtAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/debts/${id}/reopen`, {
    method: "POST",
    json: {},
    fallback: "Could not reopen.",
    revalidate: ["/wealth/debts"],
  });
}

export async function logPayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? todayLocalISO());
  const notes = String(formData.get("notes") ?? "") || undefined;
  const transaction_id = String(formData.get("transaction_id") ?? "") || undefined;
  const link_transaction = formData.get("link_transaction") === "true" || formData.get("link_transaction") === "1";

  const json: Record<string, unknown> = { date };
  if (amount) json.amount = amount;
  if (notes) json.notes = notes;
  if (transaction_id) json.transaction_id = transaction_id;
  if (link_transaction) json.link_transaction = true;

  return mutateAndRevalidate(`/api/debts/${debtId}/payments`, {
    method: "POST",
    json,
    revalidate: ["/wealth/debts"],
  });
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

  return mutateAndRevalidate(`/api/debts/${debtId}/payments/${paymentId}`, {
    method: "PATCH",
    json,
    revalidate: ["/wealth/debts"],
  });
}

export async function deletePaymentAction(debtId: string, paymentId: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/debts/${debtId}/payments/${paymentId}`, {
    method: "DELETE",
    fallback: "Could not delete payment.",
    revalidate: ["/wealth/debts"],
  });
}

export async function applyPrepayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? todayLocalISO());
  const notes = String(formData.get("notes") ?? "") || undefined;

  return mutateAndRevalidate(`/api/debts/${debtId}/prepayments`, {
    method: "POST",
    json: { amount, date, notes },
    revalidate: ["/wealth/debts"],
  });
}

export async function simulatePrepayment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const strategy = String(formData.get("strategy") ?? "reduce_tenure");

  // simulate does not mutate, but revalidate to keep consistency
  return mutateAndRevalidate(`/api/debts/${debtId}/simulate-prepayment`, {
    method: "POST",
    json: { amount, strategy },
    revalidate: ["/wealth/debts"],
  });
}

export async function updateMonthlyIncome(prev: ActionState, formData: FormData): Promise<ActionState> {
  const monthly_income = String(formData.get("monthly_income") ?? formData.get("monthlyIncome") ?? "");
  const value = monthly_income.trim() === "" ? null : monthly_income;
  return mutateAndRevalidate("/api/users/me/settings/monthly-income", {
    method: "PATCH",
    json: { monthly_income: value },
    revalidate: ["/wealth/debts"],
  });
}

export async function regenerateAmortization(prev: ActionState, formData: FormData): Promise<ActionState> {
  const debtId = String(formData.get("debtId") ?? formData.get("id") ?? "");
  return mutateAndRevalidate(`/api/debts/${debtId}/amortization/regenerate`, {
    method: "POST",
    json: {},
    fallback: "Could not regenerate schedule.",
    revalidate: ["/wealth/debts"],
  });
}
