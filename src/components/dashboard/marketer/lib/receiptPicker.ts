import { pickFile } from "@/lib/filePicker";

/* Receipt upload. Both entry points — the new-order form's upload box and the
   Orders list re-upload button — come through here.

   A receipt is whatever the bank app produced: a screenshot in the gallery, a
   photo of a paper slip, or a PDF sitting in Downloads. So this picker offers
   the camera and the file browser alongside the photo library, and accepts
   PDFs. See src/lib/filePicker.ts for why asking first is necessary. */
export function pickReceiptFile(onFile: (file: File) => void): void {
  pickFile({
    documents: true,
    onFiles: (files) => { if (files[0]) onFile(files[0]); },
  });
}

/** Waits for the upload endpoint to come online (it can lag a cold start). */
export async function waitForUpload(api: { uploadReceipt?: unknown }, ms: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (api && api.uploadReceipt) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return !!(api && api.uploadReceipt);
}
