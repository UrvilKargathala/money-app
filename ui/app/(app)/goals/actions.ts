"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createGoal(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const target_amount = String(formData.get("target_amount") ?? "");
  const target_date = String(formData.get("target_date") ?? "");
  const priority = String(formData.get("priority") ?? "medium");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/goals", {
    method: "POST",
    json: { name, target_amount, target_date, priority, account_id, notes },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateGoal(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const target_amount = String(formData.get("target_amount") ?? "");
  const target_date = String(formData.get("target_date") ?? "");
  const priority = String(formData.get("priority") ?? "medium");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/goals/${id}`, {
    method: "PATCH",
    json: { name, target_amount, target_date, priority, notes, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

export async function deleteGoalAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/goals/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete goal." };
  revalidatePath("/goals");
  return { success: true };
}

export async function pauseGoalAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/goals/${id}/pause`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not pause." };
  revalidatePath("/goals");
  return { success: true };
}

export async function resumeGoalAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/goals/${id}/resume`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not resume." };
  revalidatePath("/goals");
  return { success: true };
}

export async function completeGoalAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/goals/${id}/complete`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not complete." };
  revalidatePath("/goals");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Contributions
// ---------------------------------------------------------------------------

export async function addContribution(prev: ActionState, formData: FormData): Promise<ActionState> {
  const goalId = String(formData.get("goalId") ?? formData.get("goal_id") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const transaction_id = String(formData.get("transaction_id") ?? "") || null;

  const json: Record<string, unknown> = { amount, date };
  if (notes) json.notes = notes;
  if (transaction_id) json.transaction_id = transaction_id;

  const res = await apiFetchRaw(`/api/goals/${goalId}/contributions`, { method: "POST", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

export async function updateContribution(prev: ActionState, formData: FormData): Promise<ActionState> {
  const goalId = String(formData.get("goalId") ?? formData.get("goal_id") ?? "");
  const contributionId = String(formData.get("contributionId") ?? formData.get("contribution_id") ?? formData.get("id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const notesRaw = formData.get("notes");
  const notes = notesRaw === null ? undefined : String(notesRaw).trim() || null;

  const json: Record<string, unknown> = {};
  if (amount) json.amount = amount;
  if (date) json.date = date;
  if (notes !== undefined) json.notes = notes;

  const res = await apiFetchRaw(`/api/goals/${goalId}/contributions/${contributionId}`, { method: "PATCH", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

export async function deleteContributionAction(goalId: string, contributionId: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/goals/${goalId}/contributions/${contributionId}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete contribution." };
  revalidatePath("/goals");
  return { success: true };
}

export async function addContributionWithTransfer(prev: ActionState, formData: FormData): Promise<ActionState> {
  const goalId = String(formData.get("goalId") ?? formData.get("goal_id") ?? "");
  const from_account_id = String(formData.get("from_account_id") ?? "");
  const to_account_id = String(formData.get("to_account_id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw(`/api/goals/${goalId}/contributions/with-transfer`, {
    method: "POST",
    json: { from_account_id, to_account_id, amount, date, notes },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function createSnapshot(prev: ActionState, formData: FormData): Promise<ActionState> {
  const goalId = String(formData.get("goalId") ?? formData.get("goal_id") ?? "");
  const date = String(formData.get("date") ?? "");

  const json: Record<string, unknown> = {};
  if (date) json.date = date;

  const res = await apiFetchRaw(`/api/goals/${goalId}/snapshots`, { method: "POST", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function createTemplate(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const default_target_amount = String(formData.get("default_target_amount") ?? "") || null;
  const default_timeframe_months_raw = String(formData.get("default_timeframe_months") ?? "");
  const default_timeframe_months = default_timeframe_months_raw ? Number(default_timeframe_months_raw) : null;
  const icon = String(formData.get("icon") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/goals/templates", {
    method: "POST",
    json: { name, description, default_target_amount, default_timeframe_months, icon },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

export async function updateTemplate(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = formData.has("name") ? String(formData.get("name") ?? "").trim() : undefined;
  const description = formData.has("description") ? (String(formData.get("description") ?? "").trim() || null) : undefined;
  const default_target_amount = formData.has("default_target_amount") ? (String(formData.get("default_target_amount") ?? "") || null) : undefined;
  const default_timeframe_months = formData.has("default_timeframe_months")
    ? (() => {
        const v = String(formData.get("default_timeframe_months") ?? "");
        return v === "" ? null : Number(v);
      })()
    : undefined;
  const icon = formData.has("icon") ? (String(formData.get("icon") ?? "").trim() || null) : undefined;
  const version = Number(formData.get("version") ?? 1);

  const json: Record<string, unknown> = { version };
  if (name !== undefined) json.name = name;
  if (description !== undefined) json.description = description;
  if (default_target_amount !== undefined) json.default_target_amount = default_target_amount;
  if (default_timeframe_months !== undefined) json.default_timeframe_months = default_timeframe_months;
  if (icon !== undefined) json.icon = icon;

  const res = await apiFetchRaw(`/api/goals/templates/${id}`, { method: "PATCH", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}

export async function deleteTemplateAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/goals/templates/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete template." };
  revalidatePath("/goals");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Distribute
// ---------------------------------------------------------------------------

export async function distributeWindfall(prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = String(formData.get("amount") ?? "");
  const res = await apiFetchRaw("/api/goals/distribute", { method: "POST", json: { amount } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/goals");
  return { success: true };
}
