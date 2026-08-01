import { isAr } from "../lib/format";

/** Bilingual labels for the orders list and order cards. */
export const orderT = () => {
  const ar = isAr();
  return ar
    ? {
        orderCode: "كود الطلبيه", summary: "ملخص الطلب", price: "سعر المنتج", qty: "الكمية",
        ship: "الشحن", dlv: "التوصيل", total: "الإجمالي", comm: "عمولتك", pendingComm: "قيد المراجعة",
        upload: "اضغط لرفع الإيصال", reupload: "إعادة رفع الإيصال", addSend: "إضافة إيصال وإرسال",
        view: "عرض الإيصال المرفوع", how: "كيفية تحصيل العمولة", pDraft: "مسودة · لم تُرسل",
        pRej: "تم رفض الإيصال", pFail: "فشل الطلب", pOk: "معتمد", pPend: "قيد التحقق", pAwait: "بانتظار تاجر",
        country: "الدولة", city: "المدينة", address: "العنوان", phone: "هاتف", whatsapp: "واتساب",
        uploadedAt: "تم رفع الإيصال", reviewedAt: "تمت المراجعة", createdAt: "أُنشئ",
        adminNoteLbl: "ملاحظات الأدمن", bizNoteLbl: "ملاحظات التاجر", prodChanged: "⚠ تغيّر المنتج",
        prodChangedNote: "قد يكون اسم أو تفاصيل هذا المنتج قد تغيّرت منذ حفظ هذه المسودة. يرجى المراجعة قبل الإرسال.",
        noProduct: "لا يوجد منتج", collapse: "طيّ الطلب",
      }
    : {
        orderCode: "Order code", summary: "Order summary", price: "Product price", qty: "Quantity",
        ship: "Shipping", dlv: "Delivery", total: "Total", comm: "Your commission", pendingComm: "Pending review",
        upload: "Upload receipt", reupload: "Re-upload receipt", addSend: "Add receipt & send",
        view: "View uploaded receipt", how: "How to collect fee", pDraft: "Draft · not sent",
        pRej: "Receipt rejected", pFail: "Order failed", pOk: "Approved", pPend: "Pending verification",
        pAwait: "Awaiting business",
        country: "Country", city: "City", address: "Address", phone: "Phone", whatsapp: "WhatsApp",
        uploadedAt: "Receipt uploaded", reviewedAt: "Reviewed", createdAt: "Created",
        adminNoteLbl: "Admin notes", bizNoteLbl: "Business owner notes", prodChanged: "⚠ Product changed",
        prodChangedNote:
          "This product's name or details may have changed since this draft was saved. Please review before sending.",
        noProduct: "No product", collapse: "Collapse",
      };
};

/** Status-filter chip labels. */
export const filterLabels = () =>
  isAr()
    ? { all: "الكل", draft: "مسودة", pending: "قيد التحقق", approved: "معتمد", rejected: "مرفوض", failed: "فشل" }
    : { all: "All", draft: "Draft", pending: "Pending", approved: "Approved", rejected: "Rejected", failed: "Failed" };
