/* Static data ported verbatim from marketer.script.js / marketer.body.html. */

import { LIBYA } from "@/lib/markets/libya";
import { platformFee } from "@/lib/markets";

/* Libya's numbers now live in src/lib/markets/libya.ts, with every other
   value that is true of Libya and not of anywhere else. These names stay so
   the call sites do not have to change, but they are one market's answers —
   a second country gets its own, and the screens then have to ask which. */

/** Platform fee: 5% of the unit price above 100 LYD, a flat 5 LYD at or below
    it. Always based on the single-unit price, never on price × qty. */
export const PLAT = LIBYA.money.fee.pct;
export const PLAT_FIXED = LIBYA.money.fee.fixed;
export const PLAT_THRESHOLD = LIBYA.money.fee.threshold;

export const platformFeeForPrice = (price: unknown): number => platformFee(price, LIBYA);

export const PAYOUT_PERIOD_MS = LIBYA.money.payoutCycleDays * 86400000;
export const MIN_WITHDRAW = LIBYA.money.minWithdraw;

export const PHONE_RE_LOCAL = LIBYA.contact.localPhone;

export const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria", GH: "Ghana", EG: "Egypt", KE: "Kenya", ZA: "South Africa", LY: "Libya",
};

export const COUNTRY_NAMES_AR: Record<string, string> = {
  NG: "نيجيريا", GH: "غانا", EG: "مصر", KE: "كينيا", ZA: "جنوب أفريقيا", LY: "ليبيا",
};

export const CATEGORY_DATA: Array<{ group: string; items: string[] }> = [
  { group: "Fashion & Style", items: ["Activewear", "Bags", "Clothing", "Intimates", "Jewelry", "Shoes", "Sunglasses", "Watches"] },
  { group: "Health & Beauty", items: ["Beauty", "Fragrance", "Grooming", "Haircare", "Makeup", "Skincare", "Supplements", "Wellness"] },
  { group: "Home & Living", items: ["Appliances", "Bath", "Bedding", "Decor", "Furniture", "Garden", "Home", "Kitchen", "Lighting"] },
  { group: "Kids & Play", items: ["Baby", "Crafts", "Hobbies", "Kids", "Maternity", "Toys"] },
  { group: "Sports & Outdoors", items: ["Camping", "Cycling", "Fishing", "Fitness", "Outdoors", "Sports"] },
  { group: "Tech & Electronics", items: ["Accessories", "Audio", "Cameras", "Computers", "Electronics", "Gaming", "Phones", "Tablets", "Wearables"] },
  { group: "Utility & Niche", items: ["Automotive", "Books", "Groceries", "Office", "Pets", "Stationery", "Tools"] },
];

export const CATEGORY_GROUP_AR: Record<string, string> = {
  "Fashion & Style": "الأزياء والموضة",
  "Health & Beauty": "الصحة والجمال",
  "Home & Living": "المنزل والمعيشة",
  "Kids & Play": "الأطفال واللعب",
  "Sports & Outdoors": "الرياضة والأنشطة الخارجية",
  "Tech & Electronics": "التقنية والإلكترونيات",
  "Utility & Niche": "المستلزمات العامة والمتنوعة",
};

export const CATEGORY_ITEM_AR: Record<string, string> = {
  Activewear: "الملابس الرياضية", Bags: "الحقائب", Clothing: "الملابس", Intimates: "الملابس الداخلية",
  Jewelry: "المجوهرات", Shoes: "الأحذية", Sunglasses: "النظارات الشمسية", Watches: "الساعات",
  Beauty: "منتجات التجميل", Fragrance: "العطور", Grooming: "العناية الشخصية", Haircare: "العناية بالشعر",
  Makeup: "المكياج", Skincare: "العناية بالبشرة", Supplements: "المكملات الغذائية", Wellness: "الصحة والعافية",
  Appliances: "الأجهزة المنزلية", Bath: "مستلزمات الحمام", Bedding: "مستلزمات النوم", Decor: "الديكور",
  Furniture: "الأثاث", Garden: "مستلزمات الحديقة", Home: "مستلزمات المنزل", Kitchen: "مستلزمات المطبخ",
  Lighting: "الإضاءة", Baby: "مستلزمات الأطفال الرضع", Crafts: "الأشغال اليدوية", Hobbies: "الهوايات",
  Kids: "مستلزمات الأطفال", Maternity: "مستلزمات الأمومة", Toys: "الألعاب", Camping: "التخييم",
  Cycling: "ركوب الدراجات", Fishing: "صيد الأسماك", Fitness: "اللياقة البدنية", Outdoors: "الأنشطة الخارجية",
  Sports: "الرياضة", Accessories: "الإكسسوارات", Audio: "الأجهزة الصوتية", Cameras: "الكاميرات",
  Computers: "أجهزة الكمبيوتر", Electronics: "الإلكترونيات", Gaming: "الألعاب الإلكترونية", Phones: "الهواتف",
  Tablets: "الأجهزة اللوحية", Wearables: "الأجهزة القابلة للارتداء", Automotive: "مستلزمات السيارات",
  Books: "الكتب", Groceries: "البقالة", Office: "المستلزمات المكتبية", Pets: "مستلزمات الحيوانات الأليفة",
  Stationery: "القرطاسية", Tools: "الأدوات",
};

export const LIBYA_CITIES: Array<{ en: string; ar: string }> = LIBYA.places.cities;

export const PAYOUT_BANKS = LIBYA.payout.banks;
export const PAYOUT_BANK_EN: Record<string, string> = LIBYA.payout.bankNamesEn;

export const bankLabel = (v: unknown, ar: boolean): string => {
  const s = String(v ?? "");
  return ar ? s : PAYOUT_BANK_EN[s] || s;
};

export const PAYOUT_METHODS = LIBYA.payout.methods.map((m) => m.value);

export const ADMIN_WHATSAPP = LIBYA.contact.supportWhatsapp;
export const ADMIN_WHATSAPP_DISPLAY = LIBYA.contact.supportWhatsappDisplay;

/** Company deposit account shown in the "how to collect fee" instructions. */
export const DEPOSIT_ACCOUNT_NAME = LIBYA.payout.depositAccountName;
export const DEPOSIT_ACCOUNT_NUMBER = LIBYA.payout.depositAccountNumber;

/** Legacy size/colour are derived from the variant GROUP NAME, never from the
    group's position — businesses can order and name their groups freely. */
export const SIZE_GROUP_NAMES = ["size", "sizes", "مقاس", "المقاس", "مقاسات", "المقاسات", "حجم", "الحجم"];
export const COLOR_GROUP_NAMES = ["color", "colour", "colors", "colours", "لون", "اللون", "الوان", "الألوان", "الالوان"];

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How many points the main chart shows before it needs panning. */
export const CHART_VISIBLE: Record<string, number> = { D: 7, M: 6, Y: 6 };
