"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createQuickTransaction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = String(formData.get("amount") ?? "");
  const type = String(formData.get("type") ?? "expense");
  const account_id = String(formData.get("account_id") ?? "");
  const category_id = String(formData.get("category_id") ?? "") || null;
  const merchant_clean = String(formData.get("merchant_clean") ?? "").trim() || null;
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!amount || Number(amount) <= 0) return { fieldErrors: { amount: "Enter an amount greater than zero." } };
  if (!account_id) return { fieldErrors: { account_id: "Select an account." } };

  // Try quick-add endpoint first (has heuristic defaults), fallback to standard
  const payload: Record<string, unknown> = { amount, type, account_id, category_id, merchant_clean, date, description };

  let res = await apiFetchRaw("/api/transactions/quick-add", { method: "POST", json: payload });
  let body = await res.json().catch(() => ({}));
  if (!res.ok && body.error?.includes("ACCOUNT_REQUIRED")) {
    // Fallback to standard create (should not happen if account_id provided)
    res = await apiFetchRaw("/api/transactions", {
      method: "POST",
      json: { type, account_id, category_id, amount, date, description, notes: null },
    });
    body = await res.json().catch(() => ({}));
  }
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return { success: true };
}
