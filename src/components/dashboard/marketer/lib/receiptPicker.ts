/* Receipt upload (gallery only).
   Both entry points — the new-order form's upload box and the Orders list
   re-upload button — come through here.

   A fresh <input> is built on every tap: reusing a hidden node left stale
   state behind, and display:none / aria-hidden nodes are unreliable targets
   for .click() on some mobile browsers. It is created and clicked
   synchronously inside the tap so the user activation needed to open the
   gallery picker is still valid. */
export function pickReceiptFile(onFile: (file: File) => void): void {
  let el: HTMLInputElement | null = null;
  try {
    el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    el.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    const input = el;
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) onFile(f);
      try { input.remove(); } catch { /* ignore */ }
    });
    document.body.appendChild(input);
    input.click();
  } catch (e) {
    console.warn("[Lateen] receipt picker", e);
    try { el?.remove(); } catch { /* ignore */ }
  }
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
