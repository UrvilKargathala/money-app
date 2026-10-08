"use server";

import { todayLocalISO } from "@/lib/format";
import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createInvestment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "mutual_fund");
  const category = String(formData.get("category") ?? "equity");
  const units = String(formData.get("units") ?? "");
  const buy_price = String(formData.get("buy_price") ?? "");
  const current_price = String(formData.get("current_price") ?? buy_price);
  const purchase_date = String(formData.get("purchase_date") ?? todayLocalISO());

  return mutateAndRevalidate("/api/investments", {
    method: "POST",
    json: { name, type, category, units, buy_price, current_price, purchase_date },
    fallback: "Could not save investment.",
    revalidate: ["/wealth/investments"],
  });
}

export async function updateInvestment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const current_price = String(formData.get("current_price") ?? "");
  const version = Number(formData.get("version") ?? 1);

  return mutateAndRevalidate(`/api/investments/${id}`, {
    method: "PATCH",
    json: { current_price, version },
    fallback: "Could not save investment.",
    revalidate: ["/wealth/investments"],
  });
}

export async function deleteInvestmentAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/investments/${id}`, {
    method: "DELETE",
    fallback: "Could not delete.",
    revalidate: ["/wealth/investments"],
  });
}

export async function updateInvestmentPrice(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const current_price = String(formData.get("current_price") ?? "");

  return mutateAndRevalidate(`/api/investments/${id}/price`, {
    method: "POST",
    json: { price: current_price, current_price },
    fallback: "Could not update price.",
    revalidate: ["/wealth/investments"],
  });
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
  const start_date = String(formData.get("start_date") ?? "").trim() || todayLocalISO();
  const end_date = String(formData.get("end_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/sips", {
    method: "POST",
    json: { investment_id, amount, frequency, next_date, account_id, start_date, end_date, notes },
    revalidate: ["/wealth/investments"],
  });
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

  return mutateAndRevalidate(`/api/sips/${id}`, {
    method: "PATCH",
    json,
    revalidate: ["/wealth/investments"],
  });
}

export async function deleteSipAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/sips/${id}`, {
    method: "DELETE",
    fallback: "Could not delete SIP.",
    revalidate: ["/wealth/investments"],
  });
}

export async function pauseSip(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/sips/${id}/pause`, {
    method: "POST",
    json: {},
    fallback: "Could not pause SIP.",
    revalidate: ["/wealth/investments"],
  });
}

export async function resumeSip(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/sips/${id}/resume`, {
    method: "POST",
    json: {},
    fallback: "Could not resume SIP.",
    revalidate: ["/wealth/investments"],
  });
}

export async function logInstallment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const date = String(formData.get("date") ?? todayLocalISO()).trim();
  return mutateAndRevalidate(`/api/sips/${id}/installment`, {
    method: "POST",
    json: { date },
    revalidate: ["/wealth/investments"],
  });
}

// ---------------------------------------------------------------------------
// Dividends
// ---------------------------------------------------------------------------

export async function createDividend(prev: ActionState, formData: FormData): Promise<ActionState> {
  const investment_id = String(formData.get("investment_id") ?? "").trim();
  const type = String(formData.get("type") ?? "dividend").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const date = String(formData.get("date") ?? todayLocalISO()).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/dividends", {
    method: "POST",
    json: { investment_id, type, amount, date, notes },
    revalidate: ["/wealth/investments"],
  });
}

export async function updateDividend(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const type = String(formData.get("type") ?? "dividend").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate(`/api/dividends/${id}`, {
    method: "PATCH",
    json: { type, amount, date, notes },
    revalidate: ["/wealth/investments"],
  });
}

export async function deleteDividendAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/dividends/${id}`, {
    method: "DELETE",
    fallback: "Could not delete dividend.",
    revalidate: ["/wealth/investments"],
  });
}
