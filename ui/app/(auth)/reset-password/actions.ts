"use server";

import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function resetAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const new_password = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Missing reset token. Please use the link from your email." };
  if (!new_password || new_password.length < 8 || !/[a-zA-Z]/.test(new_password) || !/\d/.test(new_password)) return { fieldErrors: { new_password: "At least 8 characters, including a letter and a digit." } };
  if (new_password !== confirm) return { fieldErrors: { confirm: "Passwords do not match." } };

  try {
    const res = await apiFetchRaw("/api/auth/reset-password", { method: "POST", json: { token, new_password } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.fieldErrors) return { fieldErrors: body.fieldErrors };
      return { error: body.error || "Could not reset password. Link may have expired." };
    }
    return { success: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
