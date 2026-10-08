"use server";

import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createCalendarEvent(prev: ActionState, formData: FormData): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const amount = String(formData.get("amount") ?? "") || null;
  const type = String(formData.get("type") ?? "custom");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return mutateAndRevalidate("/api/calendar/events", {
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
    fallback: "Could not save event.",
    revalidate: ["/planning/calendar"],
  });
}

export async function deleteCalendarEventAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/calendar/events/${id}`, {
    method: "DELETE",
    fallback: "Could not delete.",
    revalidate: ["/planning/calendar"],
  });
}

export async function duplicateCalendarEventAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/calendar/events/${id}/duplicate`, {
    method: "POST",
    json: {},
    fallback: "Could not duplicate.",
    revalidate: ["/planning/calendar"],
  });
}
