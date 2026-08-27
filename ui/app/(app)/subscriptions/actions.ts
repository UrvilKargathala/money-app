"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createSubscription(prev: ActionState, formData: FormData): Promise<ActionState> {
  const service_name = String(formData.get("service_name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly");
  const next_renewal_date = String(formData.get("next_renewal_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/subscriptions", {
    method: "POST",
    json: { service_name, amount, frequency, next_renewal_date, account_id, category_id, notes },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateSubscription(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const service_name = String(formData.get("service_name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly");
  const next_renewal_date = String(formData.get("next_renewal_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/subscriptions/${id}`, {
    method: "PATCH",
    json: { service_name, amount, frequency, next_renewal_date, account_id, category_id, notes, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function cancelSubscriptionAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/subscriptions/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not cancel." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function pauseSubscriptionAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/subscriptions/${id}/pause`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not pause." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function resumeSubscriptionAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/subscriptions/${id}/resume`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not resume." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export async function renewSubscriptionAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/subscriptions/${id}/renew`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not renew." };
  revalidatePath("/subscriptions");
  revalidatePath("/transactions");
  return { success: true };
}

export async function snoozeSubscriptionAction(id: string, days = 7): Promise<ActionState> {
  const d = Number(days);
  if (!Number.isInteger(d) || d < 1 || d > 90) return { fieldErrors: { days: "Snooze must be between 1 and 90 days." } };
  const res = await apiFetchRaw(`/api/subscriptions/${id}/snooze`, { method: "POST", json: { days: d } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || body.fieldErrors?.days || "Could not snooze.", fieldErrors: body.fieldErrors };
  revalidatePath("/subscriptions");
  return { success: true };
}

// alias for tasks spec
export const snooze = snoozeSubscriptionAction;

export async function dismissAuditAction(auditId: string): Promise<ActionState> {
  if (!auditId) return { error: "Audit id required." };
  const res = await apiFetchRaw(`/api/subscriptions/audits/${auditId}/dismiss`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not dismiss audit." };
  revalidatePath("/subscriptions");
  return { success: true };
}

export const dismissAudit = dismissAuditAction;

// FormData variants for useActionState compatibility
export async function snoozeSubscriptionForm(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? formData.get("subscriptionId") ?? "").trim();
  const days = Number(formData.get("days") ?? 7);
  if (!id) return { error: "Subscription id required." };
  return snoozeSubscriptionAction(id, days);
}

export async function dismissAuditForm(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("auditId") ?? formData.get("id") ?? "").trim();
  if (!id) return { error: "Audit id required." };
  return dismissAuditAction(id);
}

// keep legacy aliases for tasks spec compatibility
export const snoozeSubscription = snoozeSubscriptionAction;
