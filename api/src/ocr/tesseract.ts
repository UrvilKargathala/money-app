/**
 * Tesseract.js provider ($0, local, no keys).
 * Single reused worker per warm instance; traineddata lazy-fetched once to
 * the OS temp dir. Image bytes are never persisted — in-memory only.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OcrProvider, OcrResult, OcrWord } from "./types";

type TessWord = {
  text?: string;
  confidence?: number;
  line?: number;
};

type TessData = {
  text?: string;
  confidence?: number;
  words?: TessWord[];
};

type TessWorker = {
  recognize: (image: unknown) => Promise<{ data: TessData }>;
  setParameters: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

type TessModule = {
  createWorker: (
    langs?: string | string[],
    oem?: number,
    options?: Record<string, unknown>
  ) => Promise<TessWorker>;
};

let workerPromise: Promise<TessWorker> | null = null;
let tessModule: TessModule | null = null;

async function loadTesseract(): Promise<TessModule> {
  if (!tessModule) {
    tessModule = (await import("tesseract.js")) as unknown as TessModule;
  }
  return tessModule;
}

function tessCacheDir(): string {
  return process.env.TESSDATA_DIR?.trim() || join(tmpdir(), "moneymind-tessdata");
}

async function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tess = await loadTesseract();
      const langs = (process.env.OCR_LANGS ?? "eng+hin").trim() || "eng+hin";
      const worker = await tess.createWorker(langs, 1, { cachePath: tessCacheDir() });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function toWords(data: TessData): OcrWord[] {
  const words: OcrWord[] = [];
  // group words into lines by their line index when provided
  const raw = Array.isArray(data.words) ? data.words : [];
  for (const w of raw) {
    const text = (w.text ?? "").trim();
    if (!text) continue;
    words.push({
      text,
      confidence: typeof w.confidence === "number" ? w.confidence : 0,
      line: typeof w.line === "number" ? w.line : 0,
    });
  }
  return words;
}

function linesFromWords(words: OcrWord[]): string[] {
  const byLine = new Map<number, OcrWord[]>();
  for (const w of words) {
    const arr = byLine.get(w.line) ?? [];
    arr.push(w);
    byLine.set(w.line, arr);
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) => ws.map((w) => w.text).join(" "));
}

async function recognizePass(image: Uint8Array, psm: string): Promise<TessData> {
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const result = await worker.recognize(image);
  return result?.data ?? {};
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // ignore teardown failures
  } finally {
    workerPromise = null;
  }
}

class TesseractProvider implements OcrProvider {
  readonly name = "tesseract";

  async extractText(image: Uint8Array): Promise<OcrResult> {
    // Two PSM passes: fully-automatic page segmentation + single uniform
    // column of text. Union keeps the higher-confidence rendering per line.
    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS ?? 45000);
    const withTimeout = async <T>(p: Promise<T>): Promise<T> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          p,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    let first: TessData = {};
    let second: TessData = {};
    try {
      [first, second] = await Promise.all([
        withTimeout(recognizePass(image, "3")),
        withTimeout(recognizePass(image, "6")),
      ]);
    } catch (err) {
      await terminateOcrWorker();
      throw err;
    }

    const pickBetter = (a: TessData, b: TessData): TessData => {
      const ca = typeof a.confidence === "number" ? a.confidence : 0;
      const cb = typeof b.confidence === "number" ? b.confidence : 0;
      return cb > ca ? b : a;
    };
    const best = pickBetter(first, second);
    const words = toWords(best);
    const lines = linesFromWords(words);
    const text = lines.length > 0 ? lines.join("\n") : (best.text ?? "").trim();
    const mean =
      words.length > 0
        ? words.reduce((s, w) => s + w.confidence, 0) / words.length
        : typeof best.confidence === "number"
          ? best.confidence
          : 0;
    return { text, words, meanConfidence: Math.round(mean * 10) / 10, engine: "tesseract" };
  }
}

export function getOcrProvider(): OcrProvider {
  return new TesseractProvider();
}
