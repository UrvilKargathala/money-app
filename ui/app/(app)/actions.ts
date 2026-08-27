"use server";

import { redirect } from "next/navigation";
import { apiFetchRaw } from "@/lib/api-client";
import { clearSessionCookie } from "@/lib/session";

export async function logoutAction() {
  try {
    await apiFetchRaw("/api/auth/logout", { method: "POST" });
  } catch {}
  await clearSessionCookie();
  redirect("/login");
}
