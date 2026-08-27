"use server";

import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

export async function createTaxInvestment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const section = String(formData.get("section") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "");
  const investment_date = String(formData.get("investment_date") ?? "");
  const proof_status = String(formData.get("proof_status") ?? "pending");
  const financial_year = String(formData.get("financial_year") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/tax/investments", {
    method: "POST",
    json: { section, name, amount, investment_date, proof_status, financial_year, notes },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}

export async function updateTaxInvestment(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = String(formData.get("amount") ?? "");
  const investment_date = String(formData.get("investment_date") ?? "");
  const proof_status = String(formData.get("proof_status") ?? "pending");
  const version = Number(formData.get("version") ?? 1);

  const res = await apiFetchRaw(`/api/tax/investments/${id}`, {
    method: "PATCH",
    json: { name, amount, investment_date, proof_status, version },
  });
  const body = await res.json();
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}

export async function deleteTaxInvestmentAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/tax/investments/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete." };
  revalidatePath("/tax");
  return { success: true };
}

export async function upsertSalary(prev: ActionState, formData: FormData): Promise<ActionState> {
  const financial_year = String(formData.get("financial_year") ?? "").trim();
  const employment_type = String(formData.get("employment_type") ?? "salaried").trim();
  const basic_monthly = String(formData.get("basic_monthly") ?? "").trim();
  const hra_monthly = String(formData.get("hra_monthly") ?? "").trim();
  const lta_annual = String(formData.get("lta_annual") ?? "").trim();
  const special_allowances = String(formData.get("special_allowances") ?? "").trim();
  const employer_pf = String(formData.get("employer_pf") ?? "").trim();
  const actual_rent_monthly = String(formData.get("actual_rent_monthly") ?? "").trim();
  const other_exemptions = String(formData.get("other_exemptions") ?? "").trim();
  const gross_annual_income = String(formData.get("gross_annual_income") ?? "").trim();
  const additional_income = String(formData.get("additional_income") ?? "").trim();
  const tds_deducted = String(formData.get("tds_deducted") ?? "").trim();

  const json: Record<string, unknown> = { financial_year, employment_type };
  if (basic_monthly !== "") json.basic_monthly = basic_monthly;
  if (hra_monthly !== "") json.hra_monthly = hra_monthly;
  if (lta_annual !== "") json.lta_annual = lta_annual;
  if (special_allowances !== "") json.special_allowances = special_allowances;
  if (employer_pf !== "") json.employer_pf = employer_pf;
  if (actual_rent_monthly !== "") json.actual_rent_monthly = actual_rent_monthly;
  if (other_exemptions !== "") json.other_exemptions = other_exemptions;
  if (gross_annual_income !== "") json.gross_annual_income = gross_annual_income;
  if (additional_income !== "") json.additional_income = additional_income;
  if (tds_deducted !== "") json.tds_deducted = tds_deducted;

  const res = await apiFetchRaw("/api/tax/salary", { method: "POST", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}

export async function patchSalary(prev: ActionState, formData: FormData): Promise<ActionState> {
  const financial_year = String(formData.get("financial_year") ?? "").trim();
  const employment_type = String(formData.get("employment_type") ?? "").trim();
  const json: Record<string, unknown> = {};
  if (financial_year) json.financial_year = financial_year;
  if (employment_type) json.employment_type = employment_type;
  const fields = [
    "basic_monthly",
    "hra_monthly",
    "lta_annual",
    "special_allowances",
    "employer_pf",
    "actual_rent_monthly",
    "other_exemptions",
    "gross_annual_income",
    "additional_income",
    "tds_deducted",
  ] as const;
  for (const f of fields) {
    const v = String(formData.get(f) ?? "").trim();
    if (v !== "") json[f] = v;
    else if (formData.has(f)) json[f] = null;
  }

  const res = await apiFetchRaw("/api/tax/salary", { method: "PATCH", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}

export async function createItrDoc(prev: ActionState, formData: FormData): Promise<ActionState> {
  const financial_year = String(formData.get("financial_year") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const document_name = String(formData.get("document_name") ?? "").trim();
  const status = String(formData.get("status") ?? "pending").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const res = await apiFetchRaw("/api/tax/itr", {
    method: "POST",
    json: { financial_year, category, document_name, status, notes },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}

export async function updateItrDoc(prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  const category = formData.has("category") ? String(formData.get("category") ?? "").trim() : undefined;
  const document_name = formData.has("document_name") ? String(formData.get("document_name") ?? "").trim() : undefined;
  const status = formData.has("status") ? String(formData.get("status") ?? "").trim() : undefined;
  const notes = formData.has("notes") ? String(formData.get("notes") ?? "").trim() || null : undefined;
  const financial_year = formData.has("financial_year") ? String(formData.get("financial_year") ?? "").trim() : undefined;

  const json: Record<string, unknown> = {};
  if (category !== undefined) json.category = category;
  if (document_name !== undefined) json.document_name = document_name;
  if (status !== undefined) json.status = status;
  if (notes !== undefined) json.notes = notes;
  if (financial_year !== undefined) json.financial_year = financial_year;

  const res = await apiFetchRaw(`/api/tax/itr/${id}`, { method: "PATCH", json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}

export async function deleteItrDocAction(id: string): Promise<ActionState> {
  const res = await apiFetchRaw(`/api/tax/itr/${id}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error || "Could not delete document." };
  revalidatePath("/tax");
  return { success: true };
}

export async function suggestItrDocs(prev: ActionState, formData: FormData): Promise<ActionState> {
  const financial_year = String(formData.get("financial_year") ?? "").trim();
  const res = await apiFetchRaw("/api/tax/itr/suggest", { method: "POST", json: { financial_year } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error, fieldErrors: body.fieldErrors };
  revalidatePath("/tax");
  return { success: true };
}
