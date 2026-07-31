import { useCallback, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr } from "../lib/format";
import { pickReceiptFile, waitForUpload } from "../lib/receiptPicker";
import type { MarketerOrder } from "../lib/types";

/** Re-uploading a receipt for an existing order. A draft has no DB row yet, so
    its receipt is handed back to the caller to reopen the order form with. */
export function useReceiptUpload(onReceiptForDraft: (o: MarketerOrder, receiptUrl: string) => void) {
  const { api, orders, setOrders, reloadOrders, refreshWalletAndPayout } = useMarketerData();
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const uploadReceipt = useCallback(
    (id: string) => {
      const o = orders.find((x) => x.id === id);
      if (!o) return;
      const ar = isAr();

      pickReceiptFile(async (file) => {
        setUploadingId(id);
        try {
          const ready = await waitForUpload(api, 3000);
          if (!ready) {
            alert(ar
              ? "خدمة الرفع غير جاهزة — حدّث الصفحة وأعد المحاولة"
              : "Upload service not ready — refresh and try again.");
            return;
          }

          let url = "";
          try {
            url = await api.uploadReceipt(file);
          } catch (e) {
            console.error("[Lateen] uploadReceipt", e);
            alert((ar ? "فشل الرفع: " : "Upload failed: ") + ((e as Error).message || e));
            return;
          }

          if (!o.dbId) {
            onReceiptForDraft(o, url);
            return;
          }

          try {
            await api.reuploadReceipt(o.dbId, url, o.receiptUrl || "");
          } catch (e) {
            console.error("[Lateen] reuploadReceipt", e);
            alert((ar ? "تعذر تحديث الطلب: " : "Could not update order: ") + ((e as Error).message || e));
            return;
          }

          // A re-uploaded receipt puts the order back in front of the admin.
          setOrders((prev) =>
            prev.map((x) =>
              x.id === id
                ? {
                    ...x,
                    receiptUrl: url,
                    hasReceipt: true,
                    receiptUploadedAt: new Date().toISOString(),
                    _status: "pending",
                    adminNotes: "",
                  }
                : x,
            ),
          );
          void refreshWalletAndPayout();
          void reloadOrders();
        } finally {
          setUploadingId(null);
        }
      });
    },
    [api, orders, setOrders, reloadOrders, refreshWalletAndPayout, onReceiptForDraft],
  );

  return { uploadReceipt, uploadingId };
}
