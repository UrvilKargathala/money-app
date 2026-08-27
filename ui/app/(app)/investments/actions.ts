"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createInvestment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "mutual_fund");
  const category = String(formData.get("category") ?? "equity");
  const units = String(formData.get("units") ?? "");
  const buy_price = String(formData.get("buy_price") ?? "");
  const current_price = String(formData.get("current_price") ?? buy_price);
  const purchase_date = String(formData.get("purchase_date") ?? new Date().toISOString().slice(0, 10));

  const res = await apiFetchRaw("/api/investments", {
    method: "POST",
    json: { name, type, category, units, buy_price, current_price, purchase_date },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

export async function updateInvestment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const current_price = String(formData.get("current_price") ?? "");
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/investments/${id}`, {
    method: "PATCH",
    json: { current_price, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

export async function deleteInvestmentAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/investments/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/investments");
  return { success: true };
}

export async function updateInvestmentPrice(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const current_price = String(formData.get("current_price") ?? "");

  const res = await apiFetchRaw(`/api/investments/${id}/price`, { method: "POST", json: { price: current_price, current_price } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not update price.", fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

// ---------------------------------------------------------------------------
// SIPs
// ---------------------------------------------------------------------------

export async function createSip(prev: ActionState, formData: FormData): Promise<ActionState> {
  const investment_id = String(formData.get("investment_id") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "monthly").trim();
  const next_date = String(formData.get("next_date") ?? "").trim();
  const account_id = String(formData.get("account_id") ?? "").trim() || null;
  const start_date = String(formData.get("start_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/sips", {
    method: "POST",
    json: { investment_id, amount, frequency, next_date, account_id, start_date, end_date, notes },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

export async function updateSip(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "").trim();
  const next_date = String(formData.get("next_date") ?? "").trim();
  const account_id = String(formData.get("account_id") ?? "").trim() || null;
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const json: Record<string, unknown> = {};
  if (amount) json.amount = amount;
  if (frequency) json.frequency = frequency;
  if (next_date) json.next_date = next_date;
  if (account_id !== undefined) json.account_id = account_id;
  if (end_date !== undefined) json.end_date = end_date;
  if (notes !== undefined) json.notes = notes;

  const res = await apiFetchRaw(`/api/sips/${id}`, { method: "PATCH", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

export async function deleteSipAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/sips/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete SIP." };
  revalidatePath("/investments");
  return { success: true };
}

export async function pauseSip(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/sips/${id}/pause`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not pause SIP." };
  revalidatePath("/investments");
  return { success: true };
}

export async function resumeSip(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/sips/${id}/resume`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not resume SIP." };
  revalidatePath("/investments");
  return { success: true };
}

export async function logInstallment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10)).trim();
  const res = await apiFetchRaw(`/api/sips/${id}/installment`, { method: "POST", json: { date } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Dividends
// ---------------------------------------------------------------------------

export async function createDividend(prev: ActionState, formData: FormData): Promise<ActionState> {
  const investment_id = String(formData.get("investment_id") ?? "").trim();
  const type = String(formData.get("type") ?? "dividend").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10)).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/dividends", {
    method: "POST",
    json: { investment_id, type, amount, date, notes },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

export async function updateDividend(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const type = String(formData.get("type") ?? "dividend").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw(`/api/dividends/${id}`, {
    method: "PATCH",
    json: { type, amount, date, notes },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/investments");
  return { success: true };
}

export async function deleteDividendAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/dividends/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete dividend." };
  revalidatePath("/investments");
  return { success: true };
}
