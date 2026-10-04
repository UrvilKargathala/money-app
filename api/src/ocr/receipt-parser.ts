/**
 * Deterministic receipt parser for Indian receipts (free, no ML calls).
 * Pure functions over OCR text lines — unit-testable without Tesseract.
 *
 * Multi-transaction edge: receipts carrying several total-like amounts
 * (split tender, multi-invoice photos) yield one candidate PER total, so the
 * kanban review can confirm/discard each independently.
 */
import type { ParseOutcome, ScanCandidate } from "./types";

const TOTAL_KEYS =
  /(grand\s*total|net\s*(amount|payable)|amount\s*(payable|paid|due)|total(\s*(amount|bill|payable))?|balance\s*due|you\s*pay|payable)\b/i;

const SUBTOTAL_KEYS = /(sub[\s-]*total|gross\s*amount|bill\s*amount|taxable\s*(value|amount))\b/i;

const TAX_KEYS = /(^|\s)(cgst|sgst|igst|utgst|gst|vat|service\s*tax|cess)(\s|$|[\s:])/i;

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Zz][A-Z\d]\b/;

const UTR_RE = /\b(?:utr|upi\s*(?:ref(?:erence)?(?:\s*(?:no|number|id))?)?|ref(?:erence)?(?:\s*(?:no|number|id))?|txn(?:\s*id)?|rrn)\s*[:#-]?\s*([A-Za-z0-9]{6,25})\b/i;

const DATE_RES = [
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/,
  /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/,
];

function cleanAmountToken(token: string): number | null {
  let s = token.replace(/[₹RrSs$,\s]/g, "").trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/^(cr|dr)$/i.test(s.slice(-2))) {
    negative = /^cr$/i.test(s.slice(-2)) ? false : true;
    s = s.slice(0, -2);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return null;
  return negative ? -Math.abs(n) : n;
}

export function extractAmounts(line: string): number[] {
  const out: number[] = [];
  const re = /\(?₹?\s?\d[\d,]*(?:\.\d{1,2})?\)?(?:\s*(?:cr|dr))?/gi;
  for (const m of line.matchAll(re)) {
    const n = cleanAmountToken(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

export function extractDate(line: string): string | null {
  for (const [i, re] of DATE_RES.entries()) {
    const m = line.match(re);
    if (!m) continue;
    let d: number;
    let mo: number;
    let y: number;
    if (i === 0) {
      d = Number(m[1]);
      mo = Number(m[2]);
      y = Number(m[3]);
    } else {
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
    }
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) continue;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) continue;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

export function extractGstin(line: string): string | null {
  const m = line.match(GSTIN_RE);
  return m ? m[0].toUpperCase().replace(/z/i, "Z") : null;
}

export function extractUtr(line: string): string | null {
  const m = line.match(UTR_RE);
  return m?.[1] ?? null;
}

function isNoiseLine(line: string): boolean {
  const s = line.trim();
  if (s.length < 2) return true;
  if (/^[*\-=_#~.]+$/.test(s)) return true;
  if (/thank\s*you|visit\s*again|have\s*a\s*(nice|good|great)/i.test(s)) return true;
  return false;
}

function guessMerchant(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const s = line.trim();
    if (isNoiseLine(s)) continue;
    if (/\d{4,}/.test(s)) continue; // phone/address/GSTIN rows
    if (TOTAL_KEYS.test(s) || TAX_KEYS.test(s)) continue;
    const cleaned = s.replace(/[^A-Za-z0-9&'.\- ]/g, "").trim();
    if (cleaned.length >= 3) return cleaned.slice(0, 80);
  }
  return null;
}

type TotalHit = { lineIndex: number; line: string; amount: number };

function findTotalHits(lines: string[]): TotalHit[] {
  const hits: TotalHit[] = [];
  lines.forEach((line, i) => {
    if (!TOTAL_KEYS.test(line)) return;
    if (/(sub[\s-]*total)/i.test(line) && !/grand/i.test(line)) return;
    const amounts = extractAmounts(line);
    if (amounts.length === 0) {
      // total on next line ("TOTAL" \n "Rs. 1,250.00")
      const next = lines[i + 1] ?? "";
      const nextAmounts = extractAmounts(next);
      if (nextAmounts.length > 0) {
        hits.push({ lineIndex: i, line: `${line} ${next}`.trim(), amount: nextAmounts[nextAmounts.length - 1] });
      }
      return;
    }
    hits.push({ lineIndex: i, line, amount: amounts[amounts.length - 1] });
  });
  return hits;
}

function findSubtotal(lines: string[]): number | null {
  for (const line of lines) {
    if (!SUBTOTAL_KEYS.test(line)) continue;
    const amounts = extractAmounts(line);
    if (amounts.length > 0) return amounts[amounts.length - 1];
  }
  return null;
}

function findTaxTotal(lines: string[]): number | null {
  let sum = 0;
  let found = false;
  for (const line of lines) {
    if (!TAX_KEYS.test(line)) continue;
    if (TOTAL_KEYS.test(line)) continue;
    const amounts = extractAmounts(line);
    if (amounts.length === 0) continue;
    // Sum ALL amounts: one line often holds both legs ("CGST 7.20 SGST 7.20").
    for (const a of amounts) sum += a;
    found = true;
  }
  return found ? Math.round(sum * 100) / 100 : null;
}

function guessCategory(merchant: string | null, lines: string[]): string | null {
  const hay = `${merchant ?? ""} ${lines.slice(0, 12).join(" ")}`.toLowerCase();
  if (/restaurant|hotel|cafe|dhaba|food|swiggy|zomato|pizza|biryani/.test(hay)) return "Food & Dining";
  if (/groc|supermarket|mart|kirana|bigbasket|blinkit|zepto/.test(hay)) return "Groceries";
  if (/fuel|petrol|diesel|hpcl|iocl|bpcl|shell/.test(hay)) return "Fuel";
  if (/uber|ola|metro|railway|irctc|indigo|spicejet|air\b/.test(hay)) return "Transport";
  if (/pharma|hospital|clinic|doctor|apollo|med/.test(hay)) return "Healthcare";
  if (/electricity|water|gas|broadband|jio|airtel|vi\b|recharge/.test(hay)) return "Utilities";
  if (/amazon|flipkart|myntra|shopping|mall|store|bazaar/.test(hay)) return "Shopping";
  if (/movie|pvr|inox|bookmyshow|ott|netflix|spotify/.test(hay)) return "Entertainment";
  return null;
}

function confidenceFor(args: {
  ocrMean: number;
  hasMerchant: boolean;
  hasDate: boolean;
  mathOk: boolean | null;
  isFallback: boolean;
}): number {
  let c = args.ocrMean * 0.5;
  if (args.hasMerchant) c += 12;
  if (args.hasDate) c += 10;
  if (args.mathOk === true) c += 18;
  else if (args.mathOk === false) c -= 15;
  if (args.isFallback) c -= 20;
  return Math.max(0, Math.min(100, Math.round(c)));
}

export function parseReceiptText(text: string, ocrMeanConfidence: number): ParseOutcome {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0 && !isNoiseLine(l));

  if (lines.length === 0) return { candidates: [], ocrMeanConfidence };

  const merchant = guessMerchant(lines);
  let date: string | null = null;
  let gstin: string | null = null;
  let utr: string | null = null;
  for (const line of lines) {
    if (!date) date = extractDate(line);
    if (!gstin) gstin = extractGstin(line);
    if (!utr) utr = extractUtr(line);
  }
  const subtotal = findSubtotal(lines);
  const taxTotal = findTaxTotal(lines);
  const categoryGuess = guessCategory(merchant, lines);
  const totalHits = findTotalHits(lines);

  const build = (
    amount: number | null,
    sourceLines: string[],
    extraFlags: string[],
    isFallback: boolean
  ): ScanCandidate => {
    const mathOk =
      amount !== null && subtotal !== null && taxTotal !== null
        ? Math.abs(subtotal + taxTotal - amount) <= 1.01
        : null;
    const flags = [...extraFlags];
    if (mathOk === false) flags.push("unbalanced_math");
    return {
      merchant,
      date,
      amount,
      currency: "INR",
      categoryGuess,
      taxAmount: taxTotal,
      utr,
      gstin,
      confidence: confidenceFor({
        ocrMean: ocrMeanConfidence,
        hasMerchant: merchant !== null,
        hasDate: date !== null,
        mathOk,
        isFallback,
      }),
      sourceLines: sourceLines.slice(0, 4),
      flags,
    };
  };

  if (totalHits.length === 0) {
    // Fallback: largest amount on the page (flagged low-trust).
    let best: { amount: number; line: string } | null = null;
    for (const line of lines) {
      for (const a of extractAmounts(line)) {
        if (!best || a > best.amount) best = { amount: a, line };
      }
    }
    if (!best) {
      return {
        candidates: [
          {
            merchant,
            date,
            amount: null,
            currency: "INR",
            categoryGuess,
            taxAmount: taxTotal,
            utr,
            gstin,
            confidence: confidenceFor({ ocrMean: ocrMeanConfidence, hasMerchant: merchant !== null, hasDate: date !== null, mathOk: null, isFallback: true }),
            sourceLines: lines.slice(0, 4),
            flags: ["no_total_found"],
          },
        ],
        ocrMeanConfidence,
      };
    }
    return {
      candidates: [build(best.amount, [best.line], ["fallback_largest_amount", "low_confidence"], true)],
      ocrMeanConfidence,
    };
  }

  // Multi-total edge: dedupe identical amounts on adjacent lines, keep the rest
  // as sibling candidates ($500 + $300 case).
  const deduped: TotalHit[] = [];
  for (const h of totalHits) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.amount === h.amount && h.lineIndex - prev.lineIndex <= 2) continue;
    deduped.push(h);
  }
  const candidates = deduped.map((h, idx) =>
    build(
      h.amount,
      [h.line],
      deduped.length > 1 ? ["multi_total", `candidate_${idx + 1}_of_${deduped.length}`] : [],
      false
    )
  );
  return { candidates, ocrMeanConfidence };
}
