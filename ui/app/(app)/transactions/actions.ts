"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createTransaction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const type = String(formData.get("type") ?? "");
  const account_id = String(formData.get("account_id") ?? "");
  const category_id = String(formData.get("category_id") ?? "") || null;
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/transactions", {
    method: "POST",
    json: { type, account_id, category_id, amount, date, description, notes },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return { success: true };
}

export async function updateTransaction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type") ?? "");
  const account_id = String(formData.get("account_id") ?? "");
  const category_id = String(formData.get("category_id") ?? "") || null;
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/transactions/${id}`, {
    method: "PATCH",
    json: { type, account_id, category_id, amount, date, description, notes, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteTransactionAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/transactions/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete transaction." };
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createTag(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  const res = await apiFetchRaw("/api/tags", { method: "POST", json: { name, color } });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/transactions");
  return { success: true };
}

export async function updateTag(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  const res = await apiFetchRaw(`/api/tags/${id}`, { method: "PATCH", json: { name, color } });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/transactions");
  return { success: true };
}

export async function deleteTagAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/tags/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete tag." };
  revalidatePath("/transactions");
  return { success: true };
}

export async function createCategory(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const parent_id = String(formData.get("parent_id") ?? "") || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const res = await apiFetchRaw("/api/categories", { method: "POST", json: { name, parent_id, color, icon } });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/transactions");
  return { success: true };
}

export async function attachTagAction(transactionId: string, tagId: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/transactions/${transactionId}/tags`, { method: "POST", json: { tag_id: tagId } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not attach tag." };
  revalidatePath("/transactions");
  return { success: true };
}

export async function detachTagAction(transactionId: string, tagId: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/transactions/${transactionId}/tags/${tagId}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not detach tag." };
  revalidatePath("/transactions");
  return { success: true };
}
