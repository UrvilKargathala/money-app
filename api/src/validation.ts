export function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}