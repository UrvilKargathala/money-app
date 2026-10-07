/**
 * Strict money parser: optional sign, digits, optional 2-decimal fraction.
 * Rejects Number() quirks callers never intend: "1e21", "0x10", "Infinity",
 * "NaN", ".", "1.", and >2-decimal fractions. Returns null for anything that
 * is not an exact decimal amount (numeric inputs are rounded to paise).
 */
const AMOUNT_RE = /^-?(\d+(\.\d{1,2})?|\.\d{1,2})$/;

export function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  }
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (cleaned === "" || !AMOUNT_RE.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}