/**
 * Image pre-processing for OCR (free, sharp).
 * Longest-edge resize + grayscale + normalize: the cheapest accuracy win,
 * and it cuts Tesseract time/RAM on serverless.
 */

type SharpInstance = {
  grayscale: () => SharpInstance;
  normalize: () => SharpInstance;
  sharpen: () => SharpInstance;
  resize: (w: number | null, h: number | null, opts?: Record<string, unknown>) => SharpInstance;
  png: () => SharpInstance;
  toBuffer: () => Promise<Uint8Array>;
};

type SharpModule = (input: Uint8Array) => SharpInstance;

let sharpCtor: SharpModule | null = null;

async function loadSharp(): Promise<SharpModule> {
  if (!sharpCtor) {
    const mod = (await import("sharp")) as unknown as { default: SharpModule };
    sharpCtor = mod.default;
  }
  return sharpCtor;
}

export function sniffImageKind(bytes: Uint8Array): "jpeg" | "png" | "webp" | "pdf" | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "webp";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  return null;
}

export async function preprocessImage(bytes: Uint8Array): Promise<Uint8Array> {
  const sharp = await loadSharp();
  const out = await sharp(bytes)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
  return new Uint8Array(out);
}
