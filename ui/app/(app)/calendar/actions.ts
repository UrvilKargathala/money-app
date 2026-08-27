"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createCalendarEvent(prev: ActionState, formData: FormData): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const amount = String(formData.get("amount") ?? "") || null;
  const type = String(formData.get("type") ?? "custom");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/calendar/events", {
    method: "POST",
    json: {
      title,
      event_date: date,
      event_type: type,
      amount,
      notes,
      // keep legacy aliases for compatibility
      date,
      type,
    },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/calendar");
  return { success: true };
}

export async function deleteCalendarEventAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/calendar/events/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/calendar");
  return { success: true };
}

export async function duplicateCalendarEventAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/calendar/events/${id}/duplicate`, { method: "POST", json: {} });
  const body = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) return { error: body.error || "Could not duplicate." };
  revalidatePath("/calendar");
  return { success: true };
}
