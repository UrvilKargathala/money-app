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