"use server";

import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createGoal(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const target_amount = String(formData.get("target_amount") ?? "");
  const target_date = String(formData.get("target_date") ?? "");
  const priority = String(formData.get("priority") ?? "medium");
  const account_id = String(formData.get("account_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/goals", {
    method: "POST",
    json: { name, target_amount, target_date, priority, account_id, notes },
    fallback: "Could not save goal.",
    revalidate: ["/wealth/goals", "/overview/dashboard"],
  });
}

export async function updateGoal(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const target_amount = String(formData.get("target_amount") ?? "");
  const target_date = String(formData.get("target_date") ?? "");
  const priority = String(formData.get("priority") ?? "medium");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const version = Number(formData.get("version") ?? 1);

  return mutateAndRevalidate(`/api/goals/${id}`, {
    method: "PATCH",
    json: { name, target_amount, target_date, priority, notes, version },
    fallback: "Could not save goal.",
    revalidate: ["/wealth/goals"],
  });
}

export async function deleteGoalAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/goals/${id}`, {
    method: "DELETE",
    fallback: "Could not delete goal.",
    revalidate: ["/wealth/goals"],
  });
}

export async function pauseGoalAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/goals/${id}/pause`, {
    method: "POST",
    json: {},
    fallback: "Could not pause.",
    revalidate: ["/wealth/goals"],
  });
}

export async function resumeGoalAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/goals/${id}/resume`, {
    method: "POST",
    json: {},
    fallback: "Could not resume.",
    revalidate: ["/wealth/goals"],
  });
}

export async function completeGoalAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/goals/${id}/complete`, {
    method: "POST",
    json: {},
    fallback: "Could not complete.",
    revalidate: ["/wealth/goals"],
  });
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

  return mutateAndRevalidate(`/api/goals/${goalId}/contributions`, {
    method: "POST",
    json,
    revalidate: ["/wealth/goals"],
  });
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

  return mutateAndRevalidate(`/api/goals/${goalId}/contributions/${contributionId}`, {
    method: "PATCH",
    json,
    revalidate: ["/wealth/goals"],
  });
}

export async function deleteContributionAction(goalId: string, contributionId: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/goals/${goalId}/contributions/${contributionId}`, {
    method: "DELETE",
    fallback: "Could not delete contribution.",
    revalidate: ["/wealth/goals"],
  });
}

export async function addContributionWithTransfer(prev: ActionState, formData: FormData): Promise<ActionState> {
  const goalId = String(formData.get("goalId") ?? formData.get("goal_id") ?? "");
  const from_account_id = String(formData.get("from_account_id") ?? "");
  const to_account_id = String(formData.get("to_account_id") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? new Date().toISOString().slice(0, 10));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate(`/api/goals/${goalId}/contributions/with-transfer`, {
    method: "POST",
    json: { from_account_id, to_account_id, amount, date, notes },
    revalidate: ["/wealth/goals"],
  });
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function createSnapshot(prev: ActionState, formData: FormData): Promise<ActionState> {
  const goalId = String(formData.get("goalId") ?? formData.get("goal_id") ?? "");
  const date = String(formData.get("date") ?? "");

  const json: Record<string, unknown> = {};
  if (date) json.date = date;

  return mutateAndRevalidate(`/api/goals/${goalId}/snapshots`, {
    method: "POST",
    json,
    revalidate: ["/wealth/goals"],
  });
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

  return mutateAndRevalidate("/api/goals/templates", {
    method: "POST",
    json: { name, description, default_target_amount, default_timeframe_months, icon },
    revalidate: ["/wealth/goals"],
  });
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

  return mutateAndRevalidate(`/api/goals/templates/${id}`, {
    method: "PATCH",
    json,
    revalidate: ["/wealth/goals"],
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/goals/templates/${id}`, {
    method: "DELETE",
    fallback: "Could not delete template.",
    revalidate: ["/wealth/goals"],
  });
}

// ---------------------------------------------------------------------------
// Distribute
// ---------------------------------------------------------------------------

export async function distributeWindfall(prev: ActionState, formData: FormData): Promise<ActionState> {
  const amount = String(formData.get("amount") ?? "");
  return mutateAndRevalidate("/api/goals/distribute", {
    method: "POST",
    json: { amount },
    revalidate: ["/wealth/goals"],
  });
}
