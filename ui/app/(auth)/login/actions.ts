"use server";

import { redirect } from "next/navigation";
import { apiFetchRaw } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session";
import type { ActionState } from "@moneymind/api";

export async function loginAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!email) return { fieldErrors: { email: "Please enter your email." } };
  if (!password) return { fieldErrors: { password: "Please enter your password." } };

  try {
    const res = await apiFetchRaw("/api/auth/login", {
      method: "POST",
      json: { email, password, remember },
    });
    const body = await res.json();

    if (!res.ok) {
      if (body.fieldErrors) return { fieldErrors: body.fieldErrors };
      return { error: body.error || "Invalid email or password." };
    }

    const token: string | undefined = body.token;
    const maxAge: number = body.maxAge ?? (remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60);

    if (token) {
      await setSessionCookie(token, maxAge);
    }

    redirect("/dashboard");
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    return { error: "Something went wrong. Please try again." };
  }
}
