"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createBill(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "") || null;
  const estimated_amount = String(formData.get("estimated_amount") ?? "") || null;
  const due_day = String(formData.get("due_day") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const reminder_days = String(formData.get("reminder_days") ?? "3");
  const is_autopay = formData.get("is_autopay") === "on" ? 1 : 0;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const amt = amount ? amount : undefined;
  const est = estimated_amount ? estimated_amount : undefined;

  const res = await apiFetchRaw("/api/bills", {
    method: "POST",
    json: { name, amount: amt, estimated_amount: est, due_day, frequency, account_id, category_id, reminder_days, is_autopay, notes },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/bills");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateBill(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "") || null;
  const estimated_amount = String(formData.get("estimated_amount") ?? "") || null;
  const due_day = String(formData.get("due_day") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const reminder_days = String(formData.get("reminder_days") ?? "3");
  const is_autopay = formData.get("is_autopay") === "on" ? 1 : 0;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/bills/${id}`, {
    method: "PATCH",
    json: { name, amount, estimated_amount, due_day, frequency, account_id, category_id, reminder_days, is_autopay, notes, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/bills");
  return { success: true };
}

export async function deactivateBillAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/bills/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not deactivate bill." };
  revalidatePath("/bills");
  return { success: true };
}

export async function reactivateBillAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/bills/${id}/reactivate`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not reactivate." };
  revalidatePath("/bills");
  return { success: true };
}

export async function markPaidAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/bills/${id}/mark-paid`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not mark paid." };
  revalidatePath("/bills");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return { success: true };
}

export async function skipBillAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/bills/${id}/skip`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not skip." };
  revalidatePath("/bills");
  return { success: true };
}

export async function toggleAutopayAction(id: string, enabled: boolean): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/bills/${id}/autopay`, { method: "PATCH", json: { is_autopay: enabled ? 1 : 0 } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not update autopay." };
  revalidatePath("/bills");
  return { success: true };
}

export async function createReminder(prev: ActionState, formData: FormData): Promise<ActionState> {
  const billId = String(formData.get("billId") ?? formData.get("bill_id") ?? formData.get("id") ?? "").trim();
  const daysBeforeRaw = String(formData.get("days_before") ?? formData.get("daysBefore") ?? "3");
  const channel = String(formData.get("channel") ?? "in_app").trim() || "in_app";
  const days_before = Number(daysBeforeRaw);
  const is_enabled = formData.get("is_enabled") === "0" || formData.get("is_enabled") === "false" ? 0 : 1;
  if (!billId) return { error: "Bill id is required." };
  if (!Number.isInteger(days_before) || days_before < 0 || days_before > 90) {
    return { fieldErrors: { days_before: "Days must be between 0 and 90." } };
  }
  const res = await apiFetchRaw(`/api/bills/${billId}/reminders`, {
    method: "POST",
    json: { days_before, channel, is_enabled },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || body.fieldErrors?.days_before || "Could not create reminder.", fieldErrors: body.fieldErrors };
  revalidatePath("/bills");
  return { success: true };
}

export async function updateReminder(prev: ActionState, formData: FormData): Promise<ActionState> {
  const billId = String(formData.get("billId") ?? formData.get("bill_id") ?? "").trim();
  const reminderId = String(formData.get("reminderId") ?? formData.get("reminder_id") ?? "").trim();
  const daysBeforeRaw = String(formData.get("days_before") ?? "3");
  const days_before = Number(daysBeforeRaw);
  const is_enabled = formData.get("is_enabled") === "0" || formData.get("is_enabled") === "false" ? 0 : 1;
  if (!billId || !reminderId) return { error: "Bill and reminder id are required." };
  if (!Number.isInteger(days_before) || days_before < 0 || days_before > 90) {
    return { fieldErrors: { days_before: "Days must be between 0 and 90." } };
  }
  const res = await apiFetchRaw(`/api/bills/${billId}/reminders/${reminderId}`, {
    method: "PATCH",
    json: { days_before, is_enabled },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || body.fieldErrors?.days_before || "Could not update reminder.", fieldErrors: body.fieldErrors };
  revalidatePath("/bills");
  return { success: true };
}

export async function deleteReminderAction(billId: string, reminderId: string): Promise<ActionState> {
  if (!billId || !reminderId) return { error: "Missing ids." };
  const res = await apiFetchRaw(`/api/bills/${billId}/reminders/${reminderId}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete reminder." };
  revalidatePath("/bills");
  return { success: true };
}

export async function suggestRecurringBills(): Promise<ActionState & { suggestions?: { description: string; avg_amount: number; occurrence_count: number }[] }> {
  const res = await apiFetchRaw("/api/bills/suggest-recurring", { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not fetch suggestions." };
  // still revalidate to allow UI to refresh if needed
  revalidatePath("/bills");
  return { success: true, suggestions: body.suggestions ?? [] };
}
