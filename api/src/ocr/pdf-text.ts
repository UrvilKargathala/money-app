/**
 * PDF text-layer extraction (no rendering, no OCR — per spec, PDFs are
 * text-extracted while only images are scanned).
 * First page only v1; caps pages/text to bound serverless work.
 */

const MAX_PAGES = 1;
const MAX_CHARS = 50_000;

type PdfItem = { str?: string; hasEOL?: boolean };
type PdfTextContent = { items: PdfItem[] };
type PdfPage = {
  getTextContent: () => Promise<PdfTextContent>;
  cleanup: () => void;
};
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfJs = {
  getDocument: (params: { data: Uint8Array; useWorkerFetch?: boolean; isEvalSupported?: boolean }) => {
    promise: Promise<PdfDoc>;
  };
};

let pdfjs: PdfJs | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjs) {
    // Legacy build runs in pure Node without DOM/worker setup.
    pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs;
  }
  return pdfjs;
}

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const chunks: string[] = [];
    for (let p = 1; p <= pages; p += 1) {
      const page = await doc.getPage(p);
      try {
        const content = await page.getTextContent();
        let line = "";
        for (const item of content.items) {
          const s = item.str ?? "";
          line += s;
          if (item.hasEOL) {
            chunks.push(line);
            line = "";
          } else {
            line += " ";
          }
        }
        if (line.trim()) chunks.push(line);
      } finally {
        page.cleanup();
      }
      if (chunks.join("\n").length >= MAX_CHARS) break;
    }
    return { text: chunks.join("\n").slice(0, MAX_CHARS), pages: doc.numPages };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
