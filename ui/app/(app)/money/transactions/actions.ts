"use server";

import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createTransaction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const type = String(formData.get("type") ?? "");
  const account_id = String(formData.get("account_id") ?? "");
  const rawCategory = String(formData.get("category_id") ?? "");
  const category_id = rawCategory && rawCategory !== "none" ? rawCategory : null;
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/transactions", {
    method: "POST",
    json: { type, account_id, category_id, amount, date, description, notes },
    fallback: "Could not save the transaction.",
    revalidate: ["/money/transactions", "/overview/dashboard", "/money/accounts"],
  });
}

export async function updateTransaction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type") ?? "");
  const account_id = String(formData.get("account_id") ?? "");
  const rawCategory = String(formData.get("category_id") ?? "");
  const category_id = rawCategory && rawCategory !== "none" ? rawCategory : null;
  const amount = String(formData.get("amount") ?? "");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const version = Number(formData.get("version") ?? 1);

  return mutateAndRevalidate(`/api/transactions/${id}`, {
    method: "PATCH",
    json: { type, account_id, category_id, amount, date, description, notes, version },
    fallback: "Could not save the transaction.",
    revalidate: ["/money/transactions", "/overview/dashboard"],
  });
}

export async function deleteTransactionAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/transactions/${id}`, {
    method: "DELETE",
    fallback: "Could not delete transaction.",
    revalidate: ["/money/transactions", "/overview/dashboard"],
  });
}

export async function createTag(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  return mutateAndRevalidate("/api/tags", {
    method: "POST",
    json: { name, color },
    fallback: "Could not save the tag.",
    revalidate: ["/money/transactions"],
  });
}

export async function updateTag(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  return mutateAndRevalidate(`/api/tags/${id}`, {
    method: "PATCH",
    json: { name, color },
    fallback: "Could not save the tag.",
    revalidate: ["/money/transactions"],
  });
}

export async function deleteTagAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/tags/${id}`, {
    method: "DELETE",
    fallback: "Could not delete tag.",
    revalidate: ["/money/transactions"],
  });
}

export async function createCategory(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const parent_id = String(formData.get("parent_id") ?? "") || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  return mutateAndRevalidate("/api/categories", {
    method: "POST",
    json: { name, parent_id, color, icon },
    fallback: "Could not save the category.",
    revalidate: ["/money/transactions"],
  });
}

export async function attachTagAction(transactionId: string, tagId: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/transactions/${transactionId}/tags`, {
    method: "POST",
    json: { tag_id: tagId },
    fallback: "Could not attach tag.",
    revalidate: ["/money/transactions"],
  });
}

export async function detachTagAction(transactionId: string, tagId: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/transactions/${transactionId}/tags/${tagId}`, {
    method: "DELETE",
    fallback: "Could not detach tag.",
    revalidate: ["/money/transactions"],
  });
}
