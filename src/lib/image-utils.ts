/**
 * Client-side image compression/resizing.
 *
 * Every file upload in the app funnels through the small set of upload*()
 * helpers in `lateen-api.ts`. Those helpers call `compressImage()` before
 * writing to Supabase Storage so we never persist raw, multi-megabyte
 * originals from a phone camera — everything ends up at a bounded max
 * dimension and consistent JPEG quality, which is what actually fixes the
 * "some photos load instantly and some take forever" problem end to end.
 */

export type CompressOptions = {
  /** Longest-side cap in CSS pixels. */
  maxDim: number;
  /** JPEG quality 0..1. */
  quality: number;
  /**
   * Skip compression when the source is already small enough. Prevents
   * needlessly re-encoding a well-optimised asset (which can actually make
   * the file bigger).
   */
  skipUnderBytes?: number;
};

const DEFAULTS: CompressOptions = { maxDim: 1600, quality: 0.82, skipUnderBytes: 200 * 1024 };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function loadBitmap(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, dw: number, dh: number) => void; close: () => void }> {
  // Prefer createImageBitmap — it decodes off the main thread and honours
  // EXIF orientation with imageOrientation: 'from-image'. Fall back to
  // <img> for older Safari.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
      .then((bmp) => ({
        w: bmp.width,
        h: bmp.height,
        draw: (ctx, dw, dh) => ctx.drawImage(bmp, 0, 0, dw, dh),
        close: () => bmp.close(),
      }))
      .catch(() => loadViaImg(file));
  }
  return loadViaImg(file);
}

function loadViaImg(file: File) {
  return new Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, dw: number, dh: number) => void; close: () => void }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({
      w: img.naturalWidth,
      h: img.naturalHeight,
      draw: (ctx, dw, dh) => ctx.drawImage(img, 0, 0, dw, dh),
      close: () => URL.revokeObjectURL(url),
    });
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Return a compressed JPEG File, or the original file if we can't (or
 * shouldn't) re-encode it. Never throws — a failed compression falls back
 * to the original so uploads still succeed.
 */
export async function compressImage(file: File, opts: Partial<CompressOptions> = {}): Promise<File> {
  const { maxDim, quality, skipUnderBytes } = { ...DEFAULTS, ...opts };

  if (!isBrowser()) return file;
  if (!file || !file.type) return file;
  // Only re-encode raster images. SVG / GIF are left as-is (animations, vectors).
  if (!/^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.type)) return file;
  if (skipUnderBytes && file.size <= skipUnderBytes && file.type !== "image/heic" && file.type !== "image/heif") return file;

  try {
    const src = await loadBitmap(file);
    try {
      const longest = Math.max(src.w, src.h);
      const scale = longest > maxDim ? maxDim / longest : 1;
      const dw = Math.max(1, Math.round(src.w * scale));
      const dh = Math.max(1, Math.round(src.h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      src.draw(ctx, dw, dh);

      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (!blob) return file;

      // If the "compressed" JPEG somehow came out larger than the source
      // (already-optimised small PNGs can do this), keep the original.
      if (blob.size >= file.size && scale === 1) return file;

      const base = (file.name || "photo").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      src.close();
    }
  } catch (e) {
    console.warn("[image-utils] compressImage failed, using original", e);
    return file;
  }
}

/** Presets tuned to where each asset actually renders in the UI. */
export const IMAGE_PRESETS = {
  productPhoto: { maxDim: 1600, quality: 0.82 },
  reviewPhoto: { maxDim: 1600, quality: 0.82 },
  receipt: { maxDim: 1800, quality: 0.85 }, // receipts need legible text
  avatar: { maxDim: 512, quality: 0.85, skipUnderBytes: 40 * 1024 },
} as const;
