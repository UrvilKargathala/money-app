/**
 * Client-side avatar prep: downscales oversized photos to a display-sized
 * WebP/JPEG before upload. The server sniffs bytes (jpeg/png/webp) and caps
 * at 2MB, so this changes nothing API-side — it just turns a 2MB phone photo
 * into a ~30-60KB upload. Never throws: any failure falls back to the
 * original file so the upload is never blocked by this step.
 */

export const AVATAR_MAX_EDGE = 256;

export type PreparedAvatar = { blob: Blob; type: string };

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

export async function prepareAvatarUpload(file: File): Promise<PreparedAvatar> {
  const fallback: PreparedAvatar = { blob: file, type: file.type || "image/png" };
  try {
    if (typeof createImageBitmap !== "function") return fallback;
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return fallback;
    try {
      const { width, height } = bitmap;
      if (width <= AVATAR_MAX_EDGE && height <= AVATAR_MAX_EDGE) return fallback;
      const scale = AVATAR_MAX_EDGE / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return fallback;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // Prefer WebP (smallest); fall back to JPEG; then to the original.
      const webp =
        canvas.toDataURL !== undefined
          ? await canvasToBlob(canvas, "image/webp", 0.85)
          : null;
      if (webp && webp.size > 0) return { blob: webp, type: "image/webp" };
      const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.9);
      if (jpeg && jpeg.size > 0) return { blob: jpeg, type: "image/jpeg" };
      return fallback;
    } finally {
      bitmap.close();
    }
  } catch {
    return fallback;
  }
}
