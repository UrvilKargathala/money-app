"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createBudget(prev: ActionState, formData: FormData): Promise<ActionState> {
  const category_id = String(formData.get("category_id") ?? "") || null;
  const amount = String(formData.get("amount") ?? "");
  const month = Number(formData.get("month") ?? new Date().getMonth() + 1);
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  const period = "monthly";

  const res = await apiFetchRaw("/api/budgets", {
    method: "POST",
    json: { category_id, amount, period, month, year, alert_50: 1, alert_80: 1, alert_100: 1 },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/budgets");
  return { success: true };
}

export async function updateBudget(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/budgets/${id}`, {
    method: "PATCH",
    json: { amount, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/budgets");
  return { success: true };
}

export async function deleteBudgetAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/budgets/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete budget." };
  revalidatePath("/budgets");
  return { success: true };
}
