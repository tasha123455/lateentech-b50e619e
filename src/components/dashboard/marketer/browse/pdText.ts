import { isAr, piecesLabel } from "../lib/format";

/** Bilingual labels for the product-detail sheet (the old __pdT()). */
export const pdT = () => {
  const ar = isAr();
  return {
    ar,
    title: ar ? "تفاصيل المنتج" : "Product details",
    active: ar ? "نشط" : "Active",
    paused: ar ? "متوقف" : "Paused",
    earnLbl: ar ? "ربحك من كل عملية بيع" : "Your earning per sale",
    platFee: ar ? "رسوم المنصة" : "Platform fee",
    deposit: ar ? "العربون مع رسوم المنصه" : "Your fee to collect with platform fee",
    commission: ar ? "عمولتك" : "Your commission",
    price: ar ? "سعر المنتج" : "Product price",
    stock: ar ? "المخزون" : "In stock",
    shipsTo: ar ? "التوصيل إلى" : "Delivery to",
    code: ar ? "كود المنتج" : "Product code",
    ship: ar ? "الشحن" : "Shipping fee",
    deliv: ar ? "التوصيل" : "Delivery fee",
    /* "Same day", "1 day", "2–4 days" — and their Arabic, which changes the
       noun for one and two rather than the number.
       The digits are wrapped in an isolate so a range keeps its order on an
       Arabic line, the same guard the phone country code uses. */
    eta: (min: number, max: number | null) => {
      if (max != null && max !== min) {
        const range = "\u2066" + min + "\u2013" + max + "\u2069";
        return ar ? range + " أيام" : range + " days";
      }
      if (min === 0) return ar ? "نفس اليوم" : "Same day";
      if (!ar) return min + (min === 1 ? " day" : " days");
      if (min === 1) return "يوم واحد";
      if (min === 2) return "يومين";
      return min + (min > 10 ? " يوم" : " أيام");
    },
    oneCity: ar ? "مدينة واحدة" : "1 city",
    cities: (n: number) => (ar ? n + " مدن" : n + " cities"),
    pieces: piecesLabel,
    desc: ar ? "الوصف" : "Description",
    sizes: ar ? "المقاسات" : "Sizes",
    colors: ar ? "الألوان" : "Colours",
    reviews: ar ? "التقييمات" : "Reviews",
    noRev: ar ? "لا توجد تقييمات بعد. كن أول من يضيف تقييماً." : "No reviews yet. Be the first to add one.",
    revPh: ar ? "اكتب تعليقك…" : "Write your comment…",
    revBtn: ar ? "إرسال التقييم" : "Submit review",
    share: ar ? "مشاركة" : "Share",
    saved: ar ? "محفوظ" : "Saved",
    save: ar ? "حفظ" : "Save",
    affBtn: ar ? "احصل على رابط الدفع الخاص بي" : "Get my affiliate link",
    soonMsg: ar ? "قريباً" : "soon",
    soonTxt: ar ? "رابط الدفع" : "Payment link",
    shareTxt: ar ? "شارك المنتج" : "Share product",
    anon: ar ? "مسوّق" : "Marketer",
    addPhoto: ar ? "إضافة صورة" : "Add photo",
    uploadingPhoto: ar ? "جارِ الرفع…" : "Uploading…",
    photoErr: ar ? "تعذر رفع الصورة" : "Could not upload photo",
    reportBtn: ar ? "بلاغ" : "Report",
    reportTitle: ar ? "الإبلاغ" : "Report",
    reportProduct: ar ? "بلاغ على المنتج" : "Report the product",
    reportMerchant: ar ? "بلاغ على التاجر" : "Report the merchant",
    reportOther: ar ? "بلاغ على شيء آخر" : "Report something else",
    reportPh: ar ? "اكتب تفاصيل البلاغ…" : "Describe the issue…",
    reportSend: ar ? "إرسال إلى الأدمن للتحقيق" : "Send to admin for investigation",
    reportSending: ar ? "جارِ الإرسال…" : "Sending…",
    reportSent: ar ? "تم إرسال البلاغ، شكراً لك" : "Report sent, thank you",
    reportErr: ar ? "تعذر إرسال البلاغ" : "Could not send report",
    reportNeedText: ar ? "يرجى كتابة تفاصيل البلاغ" : "Please write the report details",
  };
};

/** Bilingual labels for the saved-product picker (the old __pkT()). */
export const pkT = () => {
  const ar = isAr();
  return {
    sel: ar ? "اختر منتجاً محفوظاً" : "Select a saved product",
    title: ar ? "المنتجات المحفوظة" : "Saved products",
    search: ar ? "ابحث في المنتجات المحفوظة…" : "Search saved products…",
    commission: ar ? "عمولة" : "commission",
    noMatch: ar ? "لا توجد نتائج مطابقة." : "No matches.",
    empty: ar
      ? "لا توجد منتجات محفوظة بعد. اضغط على القلب في صفحة التصفح لحفظ منتج."
      : "No saved products yet. Tap the heart on a product in Browse to save it.",
    fieldLabel: ar ? "اختر من منتجاتك المحفوظة" : "Choose from your saved products",
    section: ar ? "المنتج" : "Product",
  };
};
