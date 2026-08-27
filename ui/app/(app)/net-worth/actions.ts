"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createManualAsset(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "property");
  const valuation = String(formData.get("valuation") ?? "");
  const acquisition_date = String(formData.get("acquisition_date") ?? new Date().toISOString().slice(0, 10));

  const res = await apiFetchRaw("/api/manual-assets", {
    method: "POST",
    json: { name, category, valuation, acquisition_date },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/net-worth");
  return { success: true };
}

export async function deleteManualAssetAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/manual-assets/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/net-worth");
  return { success: true };
}

export async function runNetWorthSnapshot(): Promise<ActionState> {
  const res = await apiFetchRaw("/api/net-worth/snapshots/run", { method: "POST", json: {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not run snapshot." };
  revalidatePath("/net-worth");
  return { success: true };
}
