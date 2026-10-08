const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatINR(amount: number): string {
  return inrFmt.format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFmt.format(d);
}

/**
 * Today as YYYY-MM-DD in LOCAL time (mirrors api isoDate). Never use
 * `new Date().toISOString().slice(0, 10)` for user-facing defaults — UTC
 * midnight is yesterday in +offset zones after local midnight.
 */
export function todayLocalISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
