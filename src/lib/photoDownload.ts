/* Saving a photo out of the app.
 *
 * Two things make this more than an <a download>.
 *
 * The photos are served from storage on another origin, and a browser ignores
 * the `download` attribute on a cross-origin link — it navigates to the image
 * instead, which on a phone replaces the app. So the bytes are fetched first
 * and handed to the link as a blob of our own.
 *
 * And "downloaded" is not the same as "in the gallery". A file saved by a
 * browser lands in Downloads, or in Files on iOS, where the camera roll never
 * looks. The share sheet is the only route a web page has to the gallery: it
 * offers "Save Image" on iOS and "Save to gallery" on Android, both of which
 * put the photo where somebody expects to find it. So sharing is tried first
 * and the download is the fallback for desktop, where a share sheet either
 * does not exist or is not what anybody wants. */

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

export type DownloadResult = "shared" | "downloaded" | "opened" | "cancelled";

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

  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return "downloaded";
}
