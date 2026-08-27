import {
  getTaxInvestments,
  getTaxUtilization,
  getTaxSummary,
  getTaxSections,
  getTaxSalary,
  getTaxCompare,
  getTaxSuggestions,
  getTaxItr,
  getTaxItrCompletion,
  getTaxFinancialYears,
} from "@/lib/api-client";
import { TaxDashboard } from "./tax-dashboard";

export const dynamic = "force-dynamic";

function currentFY(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const params = await searchParams;
  const fy = params.fy || currentFY();

  const [
    investmentsData,
    utilizationData,
    summaryData,
    sectionsData,
    salaryData,
    compareData,
    suggestionsData,
    itrData,
    itrCompletionData,
    _financialYearsData,
  ] = await Promise.all([
    getTaxInvestments(fy),
    getTaxUtilization(fy),
    getTaxSummary(fy),
    getTaxSections(),
    getTaxSalary(fy),
    getTaxCompare(fy),
    getTaxSuggestions(fy),
    getTaxItr(fy),
    getTaxItrCompletion(fy),
    getTaxFinancialYears(),
  ]);

  // Normalize utilization shape: API returns { section, name, max_limit } but UI expects section_code/section_name/limit
  const rawUtil = (utilizationData as unknown as { utilization?: Array<Record<string, unknown>> })?.utilization ?? [];
  const normalizedUtil = rawUtil.map((u) => ({
    section_code: String((u.section_code ?? u.section ?? "")),
    section_name: String((u.section_name ?? u.name ?? "")),
    limit: Number((u.limit ?? u.max_limit ?? 0)),
    invested: Number((u.invested ?? 0)),
    utilization_pct: Number((u.utilization_pct ?? 0)),
  }));

  // Summary may be flat or wrapped under `summary`
  const summaryRaw = summaryData as unknown as Record<string, unknown> | null;
  const summaryObj =
    (summaryRaw as { summary?: unknown })?.summary ??
    (summaryRaw && "total_invested" in (summaryRaw as object) ? summaryRaw : null);
  const normalizedSummary = summaryObj
    ? {
        financial_year: String((summaryObj as Record<string, unknown>).financial_year ?? fy),
        total_invested: Number((summaryObj as Record<string, unknown>).total_invested ?? 0),
        total_deduction: Number(
          (summaryObj as Record<string, unknown>).total_deduction ??
            (summaryObj as Record<string, unknown>).deduction_total ??
            0
        ),
      }
    : null;

  const rawSections = (sectionsData as unknown as { sections?: Array<Record<string, unknown>> })?.sections ?? [];
  const normalizedSections = rawSections.map((s) => ({
    section_code: String(s.section_code ?? s.section ?? ""),
    section_name: String(s.section_name ?? s.name ?? ""),
    limit: Number(s.limit ?? s.max_limit ?? 0),
  }));

  return (
    <TaxDashboard
      investments={(investmentsData?.investments ?? []) as never}
      utilization={normalizedUtil as never}
      summary={normalizedSummary as never}
      sections={normalizedSections as never}
      fy={fy}
      salary={(salaryData?.salary ?? null) as never}
      compare={(compareData ?? null) as never}
      suggestions={(suggestionsData?.suggestions ?? []) as never}
      itrDocuments={(itrData?.documents ?? []) as never}
      itrCompletion={(itrCompletionData as never) ?? null}
    />
  );
}
