"use server";

import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function magicLinkAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { fieldErrors: { email: "Please enter your email." } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { fieldErrors: { email: "Please enter a valid email address." } };
  try {
    const res = await apiFetchRaw("/api/auth/magic-link", { method: "POST", json: { email } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.fieldErrors) return { fieldErrors: body.fieldErrors };
      return { error: body.error || "Could not send magic link." };
    }
    return { success: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
