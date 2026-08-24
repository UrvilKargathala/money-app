/**
 * Minimal RFC-4180 CSV machinery for the import pipeline â€” parser, header
 * alias auto-detection, and rowâ†’draft mapping. No dependencies.
 */

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

/** RFC-4180: quoted fields, "" escapes, commas inside quotes, CR/LF/CRLF. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip fully-empty trailing lines.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      pushField();
      // swallow \r\n as one terminator
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // final unterminated line
  if (field !== "" || row.length > 0) {
    pushField();
    pushRow();
  }

  const [headers = [], ...rest] = rows;
  return { headers, rows: rest };
}

export type ColumnMapping = Record<
  "date" | "description" | "amount" | "debit" | "credit" | "type" | "category" | "merchant",
  string | number | null
>;

const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  date: ["date", "transaction date", "txn date", "posting date", "value date"],
  description: ["description", "narration", "particulars", "details", "remarks", "memo"],
  amount: ["amount", "value", "amt"],
  debit: ["debit", "withdrawal", "withdrawal amount", "debit amount", "paid out", "withdrawal amt", "debit amt"],
  credit: ["credit", "deposit", "credit amount", "paid in", "deposit amt", "credit amt"],
  type: ["type", "dr/cr", "txn type", "transaction type"],
  category: ["category"],
  merchant: ["merchant", "payee", "vendor"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort mapping from headers to logical columns. */
export function detectMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping = {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    type: null,
    category: null,
    merchant: null,
  } as ColumnMapping;

  for (const [logical, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof ColumnMapping,
    string[]
  ][]) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    mapping[logical] = idx === -1 ? null : idx;
  }
  // "amount" alias also matches inside e.g. "amount in inr".
  if (mapping.amount === null) {
    const idx = normalized.findIndex((h) => h.startsWith("amount"));
    mapping.amount = idx === -1 ? null : idx;
  }
  return mapping;
}

/** Effective mapping for a file with no client overrides. */
export function resolveEffectiveMappingInternal(headers: string[]): ColumnMapping {
  return detectMapping(headers);
}

export function resolveColumnIndex(
  headers: string[],
  value: string | number | null
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return value >= 0 && value < headers.length ? value : null;
  }
  const idx = headers.indexOf(value);
  if (idx !== -1) return idx;
  const normIdx = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(value));
  return normIdx === -1 ? null : normIdx;
}

export type ImportDraft = {
  date: string; // ISO
  amount: number; // positive
  type: "income" | "expense";
  description: string | null;
  merchant_clean: string | null;
  category_name: string | null;
};

export type RowOutcome =
  | { ok: true; draft: ImportDraft }
  | { ok: false; reason: string };

const DATE_PATTERNS = [
  { re: /^(\d{4})-(\d{2})-(\d{2})$/, order: "ymd" },
  { re: /^(\d{4})\/(\d{2})\/(\d{2})$/, order: "ymd" },
  { re: /^(\d{2})[/-](\d{2})[/-](\d{4})$/, order: "dmy" },
];

function parseDateCell(raw: string): string | null {
  const cell = raw.trim();
  for (const p of DATE_PATTERNS) {
    const m = p.re.exec(cell);
    if (!m) continue;
    const [, a, b, c] = m;
    const [year, month, day] =
      p.order === "ymd" ? [a, b, c] : [c, b, a]; // dmy â†’ dd/mm/yyyy (India default)
    const dt = new Date(Date.UTC(+year, +month - 1, +day));
    if (
      dt.getUTCFullYear() !== +year ||
      dt.getUTCMonth() !== +month - 1 ||
      dt.getUTCDate() !== +day
    ) {
      return null; // rolled over â†’ invalid calendar date
    }
    return `${+year}-${String(+month).padStart(2, "0")}-${String(+day).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Maps one raw CSV row to an import draft using the resolved column indexes.
 * Structural errors become reasons; duplicates are detected later (DB-side).
 */
export function rowToDraft(
  headers: string[],
  cells: string[],
  mapping: ColumnMapping
): RowOutcome {
  const col = (key: keyof ColumnMapping): string | null => {
    const idx = resolveColumnIndex(headers, mapping[key]);
    if (idx === null || idx >= cells.length) return null;
    const v = cells[idx]?.trim() ?? "";
    return v === "" ? null : v;
  };

  const dateIso = parseDateCell(col("date") ?? "");
  if (!dateIso) return { ok: false, reason: "invalid or missing date" };

  const debitRaw = col("debit");
  const creditRaw = col("credit");
  const amountRaw = col("amount");
  const typeRaw = (col("type") ?? "").toLowerCase();

  let type: "income" | "expense";
  let magnitude: number | null = null;

  const parseAmountCell = (raw: string): number => {
    const cleaned = raw.replace(/[â‚¹,\s]/g, "");
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      const v = Number(cleaned.slice(1, -1));
      return Number.isFinite(v) ? -v : NaN;
    }
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : NaN;
  };

  if (debitRaw !== null || creditRaw !== null) {
    const debit = debitRaw !== null ? Math.abs(parseAmountCell(debitRaw)) : null;
    const credit = creditRaw !== null ? Math.abs(parseAmountCell(creditRaw)) : null;
    if ((debitRaw !== null && Number.isNaN(debit)) || (creditRaw !== null && Number.isNaN(credit))) {
      return { ok: false, reason: "invalid amount" };
    }
    if ((debit ?? 0) > 0 && (credit ?? 0) > 0) {
      return { ok: false, reason: "both debit and credit present" };
    }
    type = (credit ?? 0) > 0 ? "income" : "expense";
    magnitude = (type === "income" ? credit : debit) ?? 0;
  } else if (amountRaw !== null) {
    const signed: number | null = amountRaw === null ? null : parseAmountCell(amountRaw);
    if (signed === null || Number.isNaN(signed)) return { ok: false, reason: "invalid amount" };
    if (signed < 0) {
      type = "expense";
      magnitude = -signed;
    } else if (signed > 0) {
      magnitude = signed;
      type =
        typeRaw.startsWith("c") || typeRaw.includes("cr")
          ? "income"
          : typeRaw.startsWith("d") || typeRaw.includes("dr")
            ? "expense"
            : "income"; // positive with no direction info â†’ income
    } else {
      return { ok: false, reason: "zero amount" };
    }
  } else {
    return { ok: false, reason: "no amount column mapped" };
  }

  if (!magnitude || magnitude <= 0) return { ok: false, reason: "zero amount" };
  magnitude = Math.round(magnitude * 100) / 100;

  const description = col("description");
  const merchant = col("merchant");
  if (!description && !merchant) {
    return { ok: false, reason: "missing description" };
  }

  return {
    ok: true,
    draft: {
      date: dateIso,
      amount: magnitude,
      type,
      description: description ?? `${merchant} txn`,
      merchant_clean: merchant,
      category_name: col("category"),
    },
  };
}

export function draftHash(draft: ImportDraft): string {
  return `${draft.date}|${draft.amount.toFixed(2)}|${(draft.description ?? "")
    .toLowerCase()
    .trim()}`;
}
