"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";

type CategoryActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  category?: { id: string; name: string; parent_id: string | null };
} | null;

export async function createInlineCategory(formData: FormData): Promise<CategoryActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const parent_id = String(formData.get("parent_id") ?? "") || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/categories", {
    method: "POST",
    json: { name, parent_id, color, icon },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };

  revalidatePath("/transactions");
  revalidatePath("/add");
  revalidatePath("/bills");
  revalidatePath("/budgets");
  revalidatePath("/subscriptions");

  return { success: true, category: body.category };
}
