/**
 * OCR provider seam (free-first).
 * `OCR_PROVIDER=tesseract` (default, $0, local). A future paid engine
 * (Mindee/Claude) plugs in as a new file implementing OcrProvider —
 * pipeline, review UI and DB stay untouched.
 */

export type OcrWord = {
  text: string;
  confidence: number; // 0-100
  line: number; // 0-based line index after reading-order sort
};

export type OcrResult = {
  text: string; // full text, lines joined by \n
  words: OcrWord[];
  meanConfidence: number; // 0-100
  engine: string;
};

export type ScanCandidate = {
  merchant: string | null;
  date: string | null; // YYYY-MM-DD
  amount: number | null;
  currency: string; // default INR
  categoryGuess: string | null;
  taxAmount: number | null;
  utr: string | null;
  gstin: string | null;
  confidence: number; // 0-100 aggregate
  sourceLines: string[]; // OCR lines evidencing this candidate
  flags: string[]; // e.g. "low_confidence", "unbalanced_math", "multi_total"
};

export type ParseOutcome = {
  candidates: ScanCandidate[];
  ocrMeanConfidence: number;
};

export interface OcrProvider {
  readonly name: string;
  extractText(image: Uint8Array): Promise<OcrResult>;
}

export function getOcrProviderName(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OCR_PROVIDER ?? "tesseract").trim().toLowerCase() || "tesseract";
}
