/* Saving a photo out of the app.
 *
 * Three things make this more than an <a download>.
 *
 * The photos are served from storage on another origin, and a browser ignores
 * the `download` attribute on a cross-origin link — it navigates to the image
 * instead, which on a phone replaces the app. So the bytes are fetched first
 * and handed to the link as a blob of our own.
 *
 * "Downloaded" is not automatically "in the gallery", but on Android it is:
 * Chrome writes to the Download collection, and MediaStore indexes pictures
 * there, so the photo turns up in Google Photos and in Samsung's Gallery under
 * the device folders without anybody being asked anything. That is the whole
 * job — save the picture, say nothing — so that is what a tap does now. It
 * used to raise the share sheet first, which meant a second decision ("who do
 * you want to send this to?") in front of a button whose answer is "nobody,
 * keep it".
 *
 * iOS is the exception, and it is not one we can code our way out of. No web
 * API writes to the camera roll, and iOS Safari's own `download` lands the
 * file in Files, where the camera roll never looks. The share sheet's "Save
 * Image" is the only route a web page has to Photos. So the sheet stays there
 * and only there: on iOS it is the difference between the photo being in the
 * gallery and not, and skipping it would be following the letter of "no share
 * sheet" while losing the point of it.
 *
 * Wrapping the app natively (Capacitor and a media plugin) is what removes the
 * sheet on iOS as well. Nothing here has to change for that — it is the same
 * button calling a different last step.
 */

/** What the file should be called once it lands. */
function filenameFor(url: string): string {
  try {
    const path = new URL(url, location.href).pathname;
    const last = decodeURIComponent(path.split("/").pop() || "");
    // Storage keys are uuids with an extension; keep it if it looks like a name.
    if (last && /\.[a-z0-9]{3,4}$/i.test(last)) return last;
  } catch {
    /* a data: URL, or something that is not a URL at all */
  }
  return "wasla-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".jpg";
}

/** iPhone or iPad — the one place where a saved file cannot reach the gallery.
 *
 *  iPadOS reports itself as a Mac, so the user agent alone puts an iPad on the
 *  desktop path. A touch screen is what tells the two apart: a Mac reports at
 *  most one touch point, an iPad reports five. Getting this wrong in either
 *  direction is a working button either way — a Mac would show a share sheet
 *  it did not need, an iPad would save into Files — so it is worth the extra
 *  condition and not worth more than that. */
function galleryNeedsShareSheet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua) && navigator.maxTouchPoints > 1;
}

export type DownloadResult = "saved" | "shared" | "opened" | "cancelled";

export async function downloadPhoto(url: string): Promise<DownloadResult> {
  if (!url) return "cancelled";
  const name = filenameFor(url);

  let blob: Blob | null = null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (res.ok) blob = await res.blob();
  } catch {
    /* CORS, or offline — handled below */
  }

  // Without the bytes there is nothing to save. Opening the image in its own
  // tab at least leaves a long-press away from saving it, which is better than
  // a button that does nothing.
  if (!blob) {
    try {
      window.open(url, "_blank", "noopener");
      return "opened";
    } catch {
      return "cancelled";
    }
  }

  if (galleryNeedsShareSheet()) {
    const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
    if (typeof File !== "undefined" && nav.share && nav.canShare) {
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });
      if (nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file] } as ShareData);
          return "shared";
        } catch (e) {
          // Dismissing the sheet is a decision, not a failure — do not then go
          // and download the file behind their back.
          if ((e as Error)?.name === "AbortError") return "cancelled";
        }
      }
    }
    // An older iOS with no file sharing has no way into Photos at all. The
    // download below still saves the picture, into Files rather than the
    // camera roll, which beats the button doing nothing.
  }

  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return "saved";
}
