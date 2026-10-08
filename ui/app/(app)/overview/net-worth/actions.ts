"use server";

import { todayLocalISO } from "@/lib/format";
import { mutateAndRevalidate } from "@/lib/server-action";
import type { ActionState } from "@moneymind/api";

export async function createManualAsset(prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "property");
  const valuation = String(formData.get("valuation") ?? "");
  const acquisition_date = String(formData.get("acquisition_date") ?? todayLocalISO());

  return mutateAndRevalidate("/api/manual-assets", {
    method: "POST",
    json: { name, category, valuation, acquisition_date },
    fallback: "Could not save asset.",
    revalidate: ["/overview/net-worth"],
  });
}

export async function deleteManualAssetAction(id: string): Promise<ActionState> {
  return mutateAndRevalidate(`/api/manual-assets/${id}`, {
    method: "DELETE",
    fallback: "Could not delete.",
    revalidate: ["/overview/net-worth"],
  });
}

export async function runNetWorthSnapshot(): Promise<ActionState> {
  return mutateAndRevalidate("/api/net-worth/snapshots/run", {
    method: "POST",
    json: {},
    fallback: "Could not run snapshot.",
    revalidate: ["/overview/net-worth"],
  });
}
