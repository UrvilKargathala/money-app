"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function deleteNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/planning/notes");
  return { success: true };
}

export async function pinNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/pin`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not pin." };
  revalidatePath("/planning/notes");
  return { success: true };
}

export async function unpinNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/unpin`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not unpin." };
  revalidatePath("/planning/notes");
  return { success: true };
}

export async function restoreNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/restore`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not restore." };
  revalidatePath("/planning/notes");
  return { success: true };
}

export async function purgeNoteAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notes/${id}/purge`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not purge." };
  revalidatePath("/planning/notes");
  return { success: true };
}
