export const SESSION_COOKIE = "mm_session";
export const SESSION_DAYS = 30;
export const DEFAULT_SESSION_SECONDS = 24 * 60 * 60; // 24h (FR-A.6)
export const REMEMBER_SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60; // 30 days

export const ACCOUNT_TYPES = [
  "bank_savings",
  "bank_current",
  "credit_card",
  "wallet",
  "cash",
  "fd",
  "ppf",
] as const;

export const ACCOUNT_COLOR_PALETTE = [
  "#2563EB",
  "#0EA5E9",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#64748B",
];

export const TAG_COLOR_PALETTE = [
  "#EF5350",
  "#42A5F5",
  "#66BB6A",
  "#FFA726",
  "#AB47BC",
  "#26A69A",
];
export const NOTE_CATEGORIES = [
  "personal",
  "financial",
  "document",
  "vehicle",
  "health",
  "insurance",
  "work",
  "home",
  "travel",
  "other",
] as const;

export type TaxDeadline = {
  /** MM-DD within any year. */
  date: string;
  label: string;
  description: string;
};

/**
 * Fixed annual tax deadline registry (C1 FR-C1.6). App config, not DB rows —
 * rendered by the calendar service for the requested year.
 */
export const CALENDAR_TAX_DEADLINES: readonly TaxDeadline[] = [
  {
    date: "03-15",
    label: "Advance tax — Q4 (FY final installment)",
    description: "Last advance-tax installment for the running financial year.",
  },
  {
    date: "04-01",
    label: "New financial year begins",
    description: "FY selector auto-advances; new tax slabs apply.",
  },
  {
    date: "06-15",
    label: "Advance tax — Q1",
    description: "First advance-tax installment (= ?10,000 liability).",
  },
  {
    date: "07-31",
    label: "ITR filing deadline",
    description: "Income-tax return filing for the previous assessment year.",
  },
  {
    date: "09-15",
    label: "Advance tax — Q2",
    description: "Second advance-tax installment.",
  },
  {
    date: "12-15",
    label: "Advance tax — Q3",
    description: "Third advance-tax installment.",
  },
] as const;
