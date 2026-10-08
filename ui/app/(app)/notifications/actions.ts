"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function markReadAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/notifications/${id}/read`, {
    method: "POST",
    json: {},
    fallback: "Could not mark read.",
    revalidate: ["/notifications"],
  });
}

export async function markAllReadAction(): Promise<ActionState> {
  return mutateAndRevalidate("/api/notifications/read-all", {
    method: "POST",
    json: {},
    fallback: "Could not mark all read.",
    revalidate: ["/notifications"],
  });
}

export async function dismissAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/notifications/${id}/dismiss`, {
    method: "POST",
    json: {},
    fallback: "Could not dismiss.",
    revalidate: ["/notifications"],
  });
}

export async function restoreAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/notifications/${id}/restore`, {
    method: "POST",
    json: {},
    fallback: "Could not restore.",
    revalidate: ["/notifications"],
  });
}

export async function bulkAction(ids: string[], action: "read" | "dismiss"): Promise<ActionState> {
  return mutateAndRevalidate("/api/notifications/bulk", {
    method: "POST",
    json: { ids, action },
    fallback: `Could not bulk ${action}.`,
    revalidate: ["/notifications"],
  });
}

function preferenceError(body: { error?: string; fieldErrors?: unknown }): string {
  if (body.error === "plan_locked")
    return "Email notifications require a paid plan.";
  if (body.error) return body.error;
  if (body.fieldErrors) return JSON.stringify(body.fieldErrors);
  return "Could not update preferences.";
}

export async function updatePreferencesAction(
  preferences: { notification_type: string; channel: string; is_enabled: boolean | number }[]
): Promise<ActionState> {
  return mutateAndRevalidate("/api/notification-preferences", {
    method: "PATCH",
    json: { preferences },
    formatError: preferenceError,
    revalidate: ["/notifications"],
  });
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
  if (!res.ok) return { error: preferenceError(body) };
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
