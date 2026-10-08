"use server";

import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createBudget(prev: ActionState, formData: FormData): Promise<ActionState> {
  const category_id = String(formData.get("category_id") ?? "") || null;
  const amount = String(formData.get("amount") ?? "");
  const month = Number(formData.get("month") ?? new Date().getMonth() + 1);
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  const period = "monthly";

  return mutateAndRevalidate("/api/budgets", {
    method: "POST",
    json: { category_id, amount, period, month, year, alert_50: 1, alert_80: 1, alert_100: 1 },
    fallback: "Could not save budget.",
    revalidate: ["/money/budgets"],
  });
}

export async function updateBudget(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const version = Number(formData.get("version") ?? 1);

  return mutateAndRevalidate(`/api/budgets/${id}`, {
    method: "PATCH",
    json: { amount, version },
    fallback: "Could not save budget.",
    revalidate: ["/money/budgets"],
  });
}

export async function deleteBudgetAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/budgets/${id}`, {
    method: "DELETE",
    fallback: "Could not delete budget.",
    revalidate: ["/money/budgets"],
  });
}
