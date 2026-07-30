import { isAr } from "../lib/format";

/** Bilingual labels for the profile page and the change-request modal. */
export const profT = () => {
  const ar = isAr();
  return {
    title: ar ? "الملف الشخصي" : "Profile",
    name: ar ? "الاسم الكامل" : "Full name",
    namePh: ar ? "مثال: هيفاء وهبي" : "Example: Kim Kardashian",
    phone: ar ? "رقم الهاتف" : "Phone number",
    email: ar ? "البريد الإلكتروني" : "Email",
    wa: ar ? "واتساب او رقم هاتف إضافي" : "WhatsApp or additional phone number",
    opt: ar ? "(اختياري)" : "(optional)",
    save: ar ? "حفظ" : "Save",
    saving: ar ? "جارٍ الحفظ…" : "Saving…",
    saved: ar ? "تم الحفظ" : "Saved",
    hint: ar ? "اضغط على أيقونة الكاميرا لتغيير الصورة" : "Tap the camera to change photo",
    tooBig: ar ? "الصورة كبيرة جداً (أقصى 5 ميغابايت)" : "Image too large (max 5 MB)",
    uploading: ar ? "جارٍ رفع الصورة…" : "Uploading photo…",
    changeBtn: ar ? "تغيير" : "Change",
    crTitle: ar ? "ما الذي تريد تغييره؟" : "What would you like to change?",
    crPhone: ar ? "تغيير رقم الهاتف" : "Change phone number",
    crEmail: ar ? "تغيير البريد الإلكتروني" : "Change email",
    crCountry: ar ? "تغيير الدولة" : "Change country",
    crSend: ar ? "إرسال إلى الأدمن للتغيير" : "Send to admin for change",
    crSent: ar ? "تم فتح واتساب لإرسال طلبك إلى الأدمن" : "WhatsApp opened to send your request to the admin",
  };
};
