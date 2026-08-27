"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createNote(prev: ActionState, formData: FormData): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  const data = String(formData.get("data") ?? "").trim();

  // Client-side encryption stub: base64 encode (real vault would use WebCrypto)
  const data_encrypted = Buffer.from(data).toString("base64");
  const data_iv = "iv-" + Math.random().toString(36).slice(2, 10);

  const res = await apiFetchRaw("/api/notes", {
    method: "POST",
    json: { title, category, data_encrypted, data_iv },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/notes");
  return { success: true };
}

export async function updateNote(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  const data = String(formData.get("data") ?? "").trim();
  const version = Number(formData.get("version") ?? 1);

  const data_encrypted = Buffer.from(data).toString("base64");
  const data_iv = "iv-" + Math.random().toString(36).slice(2, 10);

  const res = await apiFetchRaw(`/api/notes/${id}`, {
    method: "PATCH",
    json: { title, category, data_encrypted, data_iv, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/notes");
  return { success: true };
}

export async function deleteNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/notes");
  return { success: true };
}

export async function pinNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/pin`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not pin." };
  revalidatePath("/notes");
  return { success: true };
}

export async function unpinNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/unpin`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not unpin." };
  revalidatePath("/notes");
  return { success: true };
}

export async function restoreNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/restore`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not restore." };
  revalidatePath("/notes");
  return { success: true };
}

export async function purgeNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/purge`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not purge." };
  revalidatePath("/notes");
  return { success: true };
}
