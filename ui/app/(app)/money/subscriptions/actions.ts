"use server";

import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createSubscription(prev: ActionState, formData: FormData): Promise<ActionState> {
  const service_name = String(formData.get("service_name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly");
  const next_renewal_date = String(formData.get("next_renewal_date") ?? "");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/subscriptions", {
    method: "POST",
    json: { service_name, amount, frequency, next_renewal_date, account_id, category_id, notes },
    fallback: "Could not save the subscription.",
    revalidate: ["/money/subscriptions", "/overview/dashboard"],
  });
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

  return mutateAndRevalidate(`/api/subscriptions/${id}`, {
    method: "PATCH",
    json: { service_name, amount, frequency, next_renewal_date, account_id, category_id, notes, version },
    fallback: "Could not save the subscription.",
    revalidate: ["/money/subscriptions"],
  });
}

export async function cancelSubscriptionAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/subscriptions/${id}`, {
    method: "DELETE",
    fallback: "Could not cancel.",
    revalidate: ["/money/subscriptions"],
  });
}

export async function pauseSubscriptionAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/subscriptions/${id}/pause`, {
    method: "POST",
    json: {},
    fallback: "Could not pause.",
    revalidate: ["/money/subscriptions"],
  });
}

export async function resumeSubscriptionAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/subscriptions/${id}/resume`, {
    method: "POST",
    json: {},
    fallback: "Could not resume.",
    revalidate: ["/money/subscriptions"],
  });
}

export async function renewSubscriptionAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/subscriptions/${id}/renew`, {
    method: "POST",
    json: {},
    fallback: "Could not renew.",
    revalidate: ["/money/subscriptions", "/money/transactions"],
  });
}

export type SnoozeSource = "preset" | "custom";

export async function snoozeSubscriptionAction(
  id: string,
  days = 7,
  source: SnoozeSource = "custom",
  attemptId?: string
): Promise<ActionState> {
  const d = Number(days);
  if (!Number.isInteger(d) || d < 1 || d > 90) return { fieldErrors: { days: "Snooze must be between 1 and 90 days." } };
  if (source !== "preset" && source !== "custom") return { fieldErrors: { source: "Source must be preset or custom." } };
  return mutateAndRevalidate(`/api/subscriptions/${id}/snooze`, {
    method: "POST",
    json: { days: d, source, ...(attemptId ? { attempt: attemptId } : {}) },
    fallback: "Could not snooze.",
    revalidate: ["/money/subscriptions"],
  });
}

// alias for tasks spec
export const snooze = snoozeSubscriptionAction;

export async function dismissAuditAction(auditId: string): Promise<ActionState> {
  if (!auditId) return { error: "Audit id required." };
  return mutateAndRevalidate(`/api/subscriptions/audits/${auditId}/dismiss`, {
    method: "POST",
    json: {},
    fallback: "Could not dismiss audit.",
    revalidate: ["/money/subscriptions"],
  });
}

export const dismissAudit = dismissAuditAction;

// FormData variants for useActionState compatibility
export async function snoozeSubscriptionForm(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? formData.get("subscriptionId") ?? "").trim();
  const days = Number(formData.get("days") ?? 7);
  const rawSource = String(formData.get("source") ?? "custom");
  const source: SnoozeSource = rawSource === "preset" ? "preset" : "custom";
  const attempt = String(formData.get("attempt") ?? "").trim() || undefined;
  if (!id) return { error: "Subscription id required." };
  return snoozeSubscriptionAction(id, days, source, attempt);
}

export async function dismissAuditForm(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("auditId") ?? formData.get("id") ?? "").trim();
  if (!id) return { error: "Audit id required." };
  return dismissAuditAction(id);
}

// keep legacy aliases for tasks spec compatibility
export const snoozeSubscription = snoozeSubscriptionAction;
