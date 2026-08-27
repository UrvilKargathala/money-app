"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function markReadAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notifications/${id}/read`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not mark read." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function markAllReadAction(): Promise<ActionState> {
  const res = await apiFetchRaw("/api/notifications/read-all", { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not mark all read." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function dismissAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notifications/${id}/dismiss`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not dismiss." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function restoreAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/notifications/${id}/restore`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not restore." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function bulkAction(ids: string[], action: "read" | "dismiss"): Promise<ActionState> {
  const res = await apiFetchRaw("/api/notifications/bulk", { method: "POST", json: { ids, action } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || `Could not bulk ${action}.` };
  revalidatePath("/notifications");
  return { success: true };
}

export async function updatePreferencesAction(
  preferences: { notification_type: string; channel: string; is_enabled: boolean | number }[]
): Promise<ActionState> {
  const res = await apiFetchRaw("/api/notification-preferences", { method: "PATCH", json: { preferences } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || body.fieldErrors ? JSON.stringify(body.fieldErrors) : "Could not update preferences." };
  revalidatePath("/notifications");
  return { success: true };
}

export async function togglePreferenceAction(
  type: string,
  channel: string
): Promise<ActionState & { is_enabled?: boolean }> {
  const res = await apiFetchRaw(`/api/notification-preferences/${encodeURIComponent(type)}/${encodeURIComponent(channel)}`, {
    method: "PATCH",
    json: {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not toggle preference." };
  revalidatePath("/notifications");
  return { success: true, is_enabled: body.is_enabled };
}

export async function previewEmailAction(payload: { type: string; title: string; message: string }): Promise<
  ActionState & { preview?: { subject: string; body_html: string; body_text: string } }
> {
  const res = await apiFetchRaw("/api/notifications/email/preview", { method: "POST", json: payload });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || body.fieldErrors?.type || "Could not preview email." };
  return { success: true, preview: body.preview };
}
