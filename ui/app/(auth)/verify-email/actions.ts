"use server";

import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function verifyEmailAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Missing verification token." };
  try {
    const res = await apiFetchRaw("/api/auth/verify-email", { method: "POST", json: { token } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || "Verification failed or link expired." };
    return { success: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}

export async function resendVerificationAction(): Promise<ActionState> {
  try {
    const res = await apiFetchRaw("/api/auth/resend-verification", { method: "POST", json: {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || "Could not resend verification email." };
    return { success: true };
  } catch {
    return { error: "Something went wrong." };
  }
}
