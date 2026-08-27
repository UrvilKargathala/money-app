"use server";

import { redirect } from "next/navigation";
import { apiFetchRaw } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session";
import type { ActionState } from "@moneymind/api";

export async function signupAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!name || name.length < 2) fieldErrors.name = "Please enter your name (at least 2 characters).";
  if (!email) fieldErrors.email = "Please enter your email.";
  if (!password || password.length < 8) fieldErrors.password = "Password must be at least 8 characters.";
  if (password !== confirm) fieldErrors.confirm = "Passwords do not match.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    const res = await apiFetchRaw("/api/auth/signup", {
      method: "POST",
      json: { name, email, password },
    });
    const body = await res.json();

    if (!res.ok) {
      if (body.fieldErrors) return { fieldErrors: body.fieldErrors };
      return { error: body.error || "Could not create account. Please try again." };
    }

    const token: string | undefined = body.token;
    const maxAge: number = body.maxAge ?? 24 * 60 * 60;

    if (token) {
      await setSessionCookie(token, maxAge);
    }

    redirect("/dashboard");
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    return { error: "Something went wrong. Please try again." };
  }
}
