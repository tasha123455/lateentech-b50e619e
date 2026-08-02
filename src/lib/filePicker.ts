/**
 * One way into the phone's camera, photo library and file browser.
 *
 * A bare <input type="file" accept="image/*"> is not enough any more. On
 * Android 13+ Chrome hands that straight to the system Photo Picker, which
 * offers only the gallery — no camera, no Downloads, no way to reach a PDF a
 * bank app just saved. iOS still shows all three routes, but only as a menu
 * the user has to know to look for.
 *
 * So we ask first. The sheet below names the three routes, and each one opens
 * an input configured for exactly that job: `capture` for the camera,
 * `image/*` for the library, and a document accept list for the file browser.
 * A non-image accept is what makes Android open the document picker instead of
 * the photo one, so "Files" only appears where a document is actually a
 * sensible answer — a receipt, not a product photo.
 *
 * On a desktop there is no camera roll and the file dialog already browses
 * everything, so the sheet is skipped and the dialog opens straight away.
 */

import { isAr } from "@/components/dashboard/marketer/lib/format";

/** Documents we accept beside images, and the cap for them. */
export const DOC_ACCEPT = "application/pdf,.pdf";
/** Images are re-encoded before upload; a PDF is stored as-is, so it is capped. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export type FilePickOptions = {
  /** Offer the file browser and accept PDFs as well as images. */
  documents?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  /** A picked document over MAX_DOC_BYTES. Defaults to an alert. */
  onTooLarge?: (file: File) => void;
};

/** True on phones and tablets — where the three routes are genuinely different. */
function hasCameraRoll(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  } catch { /* older browsers */ }
  return (navigator.maxTouchPoints || 0) > 0;
}

export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  // Receipt URLs arrive signed, so the extension sits before the query string.
  return /\.pdf(?:$|[?#])/i.test(url.split("#")[0]);
}

/**
 * Builds an input, clicks it, and throws it away.
 *
 * A fresh node every time: reusing a hidden one left the previous selection
 * behind, and display:none nodes are unreliable .click() targets on some
 * mobile browsers. It is created and clicked synchronously so the user
 * activation that lets the picker open is still valid.
 */
function openInput(
  accept: string,
  capture: boolean,
  multiple: boolean,
  onFiles: (files: File[]) => void,
): void {
  let el: HTMLInputElement | null = null;
  try {
    el = document.createElement("input");
    el.type = "file";
    el.accept = accept;
    if (capture) el.setAttribute("capture", "environment");
    if (multiple) el.multiple = true;
    el.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    const input = el;
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (files.length) onFiles(files);
      try { input.remove(); } catch { /* ignore */ }
    });
    document.body.appendChild(input);
    input.click();
  } catch (e) {
    console.warn("[Lateen] file picker", e);
    try { el?.remove(); } catch { /* ignore */ }
  }
}

function tooLargeMessage(ar: boolean): string {
  return ar
    ? "الملف كبير جداً — الحد الأقصى ١٠ ميغابايت."
    : "That file is too large — 10 MB is the limit.";
}

/** Drops oversized documents before they reach the uploader. */
function guard(files: File[], opts: FilePickOptions): void {
  const ar = isAr();
  const ok: File[] = [];
  for (const f of files) {
    const isImage = /^image\//i.test(f.type || "");
    if (!isImage && f.size > MAX_DOC_BYTES) {
      if (opts.onTooLarge) opts.onTooLarge(f);
      else try { alert(tooLargeMessage(ar)); } catch { /* ignore */ }
      continue;
    }
    ok.push(f);
  }
  if (ok.length) opts.onFiles(ok);
}

/* ---- the sheet ---------------------------------------------------------- */

function row(label: string, sub: string, icon: string, ar: boolean, onPick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.style.cssText =
    "display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;border:none;border-radius:14px;" +
    "background:#252523;color:#f0eeeb;font:inherit;font-size:14px;cursor:pointer;text-align:" +
    (ar ? "right" : "left") + ";";
  const ic = document.createElement("span");
  ic.style.cssText =
    "width:36px;height:36px;border-radius:10px;background:#0d0d0d;display:flex;align-items:center;" +
    "justify-content:center;flex-shrink:0;color:#7f77dd;";
  ic.innerHTML = icon;
  const txt = document.createElement("span");
  txt.style.cssText = "flex:1;min-width:0;";
  const t1 = document.createElement("span");
  t1.textContent = label;
  t1.style.cssText = "display:block;font-weight:500;";
  const t2 = document.createElement("span");
  t2.textContent = sub;
  t2.style.cssText = "display:block;font-size:11px;color:#9e9b97;margin-top:1px;";
  txt.append(t1, t2);
  b.append(ic, txt);
  b.addEventListener("click", onPick);
  return b;
}

const IC_CAMERA =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>' +
  '<circle cx="12" cy="13" r="3.4"/></svg>';
const IC_PHOTOS =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/>' +
  '<path d="m4 17 4.6-4.6a1.6 1.6 0 0 1 2.3 0L15 16.5m0 0 2-2a1.6 1.6 0 0 1 2.3 0L20 15.2"/></svg>';
const IC_FILES =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>' +
  '<path d="M8.5 13h7M8.5 16.5h4.5"/></svg>';

/**
 * Asks where the file should come from, then opens that picker.
 *
 * On a desktop the question has no meaning, so the file dialog opens directly.
 */
export function pickFile(opts: FilePickOptions): void {
  const { documents = false, multiple = false } = opts;
  const imageAccept = "image/*";
  const fileAccept = documents ? `${imageAccept},${DOC_ACCEPT}` : imageAccept;

  if (!hasCameraRoll()) {
    openInput(fileAccept, false, multiple, (files) => guard(files, opts));
    return;
  }

  const ar = isAr();
  const host = document.createElement("div");
  host.setAttribute("dir", ar ? "rtl" : "ltr");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;" +
    "font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);";

  const backdrop = document.createElement("div");
  backdrop.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(3px);";

  const sheet = document.createElement("div");
  sheet.style.cssText =
    "position:relative;z-index:1;width:100%;max-width:420px;background:#1a1a1a;border-radius:20px 20px 0 0;" +
    "border-top:0.5px solid #333330;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));" +
    "display:flex;flex-direction:column;gap:8px;";

  const dismiss = () => { try { host.remove(); } catch { /* ignore */ } };
  const choose = (accept: string, capture: boolean) => () => {
    dismiss();
    openInput(accept, capture, multiple, (files) => guard(files, opts));
  };

  const title = document.createElement("div");
  title.textContent = ar ? "من وين تحب ترفع؟" : "Where from?";
  title.style.cssText = "font-size:13px;color:#9e9b97;padding:2px 4px 4px;";

  sheet.append(
    title,
    row(
      ar ? "التقط صورة" : "Take a photo",
      ar ? "افتح الكاميرا" : "Open the camera",
      IC_CAMERA, ar, choose(imageAccept, true),
    ),
    row(
      ar ? "من الصور" : "From photos",
      ar ? "معرض الصور" : "Your photo library",
      IC_PHOTOS, ar, choose(imageAccept, false),
    ),
  );

  if (documents) {
    sheet.append(
      row(
        ar ? "من الملفات" : "From files",
        // Arabic leads the line: a Latin run in first position gets bidi-flipped
        // to the far end and reads as though it came last.
        ar ? "ملف PDF أو صورة محفوظة" : "A PDF or a saved image",
        IC_FILES, ar, choose(fileAccept, false),
      ),
    );
  }

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = ar ? "إلغاء" : "Cancel";
  cancel.style.cssText =
    "margin-top:4px;height:44px;border-radius:14px;border:none;background:transparent;color:#9e9b97;" +
    "font:inherit;font-size:14px;cursor:pointer;";
  cancel.addEventListener("click", dismiss);
  sheet.append(cancel);

  backdrop.addEventListener("click", dismiss);
  host.append(backdrop, sheet);
  document.body.appendChild(host);
}
