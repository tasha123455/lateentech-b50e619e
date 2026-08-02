/* Static data ported verbatim from marketer.script.js / marketer.body.html. */

/** Platform fee: 5% of the unit price above 100 LYD, a flat 5 LYD at or below
    it. Always based on the single-unit price, never on price × qty. */
export const PLAT = 0.05;
export const PLAT_FIXED = 5;
export const PLAT_THRESHOLD = 100;

export function platformFeeForPrice(price: unknown): number {
  const pr = Number(price) || 0;
  return pr > PLAT_THRESHOLD ? parseFloat((pr * PLAT).toFixed(2)) : PLAT_FIXED;
}

export const PAYOUT_PERIOD_MS = 30 * 86400000;
export const MIN_WITHDRAW = 20;

export const PHONE_RE_LOCAL = /^09[1-4]\d{7}$/;

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

export const LIBYA_CITIES: Array<{ en: string; ar: string }> = [
  { en: "Tripoli", ar: "طرابلس" }, { en: "Benghazi", ar: "بنغازي" }, { en: "Misrata", ar: "مصراته" },
  { en: "Zawiya", ar: "الزاوية" }, { en: "Al Bayda", ar: "البيضاء" }, { en: "Sabha", ar: "سبها" },
  { en: "Sirte", ar: "سرت" }, { en: "Tobruk", ar: "طبرق" }, { en: "Ajdabiya", ar: "اجدابيا" },
  { en: "Al Khums", ar: "الخمس" }, { en: "Zliten", ar: "زليتن" }, { en: "Derna", ar: "درنه" },
  { en: "Al Marj", ar: "المرج" }, { en: "Gharyan", ar: "غريان" }, { en: "Sabratha", ar: "صبراته" },
  { en: "Surman", ar: "صرمان" }, { en: "Zuwara", ar: "زواره" }, { en: "Bani Walid", ar: "بني وليد" },
  { en: "Tarhuna", ar: "ترهونه" }, { en: "Msallata", ar: "مسلاته" }, { en: "Al Aziziyah", ar: "العزيزية" },
  { en: "Tajura", ar: "تاجوراء" }, { en: "Janzur", ar: "جنزور" }, { en: "Ain Zara", ar: "عين زارة" },
  { en: "Qasr Bin Ghashir", ar: "قصر بن غشير" }, { en: "Al Swani", ar: "السواني" },
  { en: "Garabulli", ar: "القرابولي" }, { en: "Al Ajelat", ar: "العجيلات" }, { en: "Al Jumayl", ar: "الجميل" },
  { en: "Al Zahra", ar: "الزهراء" }, { en: "Shahat", ar: "شحات" }, { en: "Susa", ar: "سوسه" },
  { en: "Al Qubbah", ar: "القبه" }, { en: "Umm al Rizam", ar: "ام رزم" }, { en: "Brega", ar: "البريقه" },
  { en: "Ras Lanuf", ar: "راس لانوف" }, { en: "Benina", ar: "بنينة" }, { en: "Suluq", ar: "سلوق" },
  { en: "Al Abyar", ar: "لبيار" }, { en: "Tocra", ar: "توكره" }, { en: "Ghemines", ar: "قمينس" },
  { en: "Yafran", ar: "يفرن" }, { en: "Zintan", ar: "الزنتان" }, { en: "Jadu", ar: "جادو" },
  { en: "Nalut", ar: "نالوت" }, { en: "Mizda", ar: "مزدة" }, { en: "Ubari", ar: "اوباري" },
  { en: "Murzuq", ar: "مرزق" }, { en: "Al Kufra", ar: "الكفره" }, { en: "Jalu", ar: "جالو" },
  { en: "Awjila", ar: "اوجله" }, { en: "Tazirbu", ar: "تازربو" }, { en: "Rebiana", ar: "ربيانة" },
  { en: "Ghat", ar: "غات" }, { en: "Ghadames", ar: "غدامس" }, { en: "Hun", ar: "هون" },
  { en: "Waddan", ar: "ودان" }, { en: "Sokna", ar: "سوكنة" }, { en: "Brak Al Shati", ar: "براك الشاطي" },
  { en: "Al Jufrah", ar: "الجفرة" }, { en: "Idri", ar: "إدري" }, { en: "Al Qatrun", ar: "القطرون" },
  { en: "Tawergha", ar: "تورغاء" }, { en: "Emsaed", ar: "امساعد" }, { en: "Al Jaghbub", ar: "الجغبوب" },
  { en: "Al Kuwayfiyah", ar: "الكويفيه" }, { en: "Ras Al Minqar", ar: "راس المنقار" },
  { en: "Sidi Khalifa", ar: "سي خليفه" }, { en: "Driana", ar: "دريانه" }, { en: "Bersis", ar: "برسس" },
  { en: "Al Mabni", ar: "المبني" }, { en: "Istatah", ar: "اسطاطه" }, { en: "Al Aweilia", ar: "لعويله" },
  { en: "Murad Masud", ar: "مراد مسعود" }, { en: "Al Aquriyah", ar: "العقوريه" },
  { en: "Zueitina", ar: "زويتنه" }, { en: "Al Bakkur", ar: "البكور" }, { en: "Al Wardiyah", ar: "الورديه" },
  { en: "Farzughah", ar: "فرزوغه" }, { en: "Tacnis", ar: "تاكنس" }, { en: "Battah", ar: "بطه" },
  { en: "Jardas", ar: "جردس" }, { en: "Zawiyat al Arqub", ar: "زاوية العرقوب" },
  { en: "Belhadid", ar: "بلحديد" }, { en: "Qasr Libya", ar: "قصر ليبيا" }, { en: "Tolmeita", ar: "طلميثة" },
  { en: "Wadi al Kuf", ar: "وادي الكوف" }, { en: "Al Bayadah", ar: "البياضه" }, { en: "Marawah", ar: "مراوه" },
  { en: "Massah", ar: "مسه" }, { en: "Qayqab", ar: "قيقب" }, { en: "Wardamah", ar: "وردامه" },
  { en: "Ras Turab", ar: "راس تراب" }, { en: "Qarnadah", ar: "قرناده" },
  { en: "Omar Al Mukhtar", ar: "عمر المختار" }, { en: "Qandulah", ar: "قندوله" },
  { en: "Al Haniyah", ar: "الحنيه" }, { en: "Al Wasitah", ar: "الوسيطه" }, { en: "Al Urban", ar: "العربان" },
  { en: "Al Faidiyah", ar: "الفايديه" }, { en: "Al Abraq", ar: "الابرق" },
  { en: "Al Mansurah", ar: "المنصوره" }, { en: "Belkhather", ar: "بالخاثر" }, { en: "Qardabah", ar: "قرضبه" },
  { en: "Bab al Zaytun", ar: "باب الزيتون" }, { en: "Al Qa'rah", ar: "القعره" },
  { en: "Kamboot", ar: "كمبوت" }, { en: "Al Watar", ar: "الوتر" }, { en: "Bir al Ashhab", ar: "بئر الاشهب" },
  { en: "Bardia", ar: "البردي" }, { en: "Ain Marah", ar: "عين ماره" }, { en: "Martuba", ar: "مرتوبه" },
  { en: "Gulf of Bomba", ar: "خليج البمبه" }, { en: "Ras al Helal", ar: "راس الهلال" },
  { en: "Kersa", ar: "كرسه" }, { en: "Al Mikhili", ar: "المخيلي" }, { en: "Al Aziyat", ar: "العزيات" },
  { en: "Al Tamimi", ar: "التميمي" }, { en: "Ain al Ghazalah", ar: "عين الغزاله" },
  { en: "Al Uqaylah", ar: "العقيله" }, { en: "Bin Jawad", ar: "بن جواد" }, { en: "Nofaliya", ar: "النوفلية" },
  { en: "Harawa", ar: "اهراوه" }, { en: "Wadi Kaam", ar: "وادي كعام" },
  { en: "Qasr Al Khiyar", ar: "قصر الخيار" }, { en: "Al Alous", ar: "العلوص" }, { en: "Bishr", ar: "بشر" },
  { en: "The South", ar: "الجنوب" }, { en: "Al Asaba", ar: "الاصابعه" }, { en: "Kikla", ar: "ككله" },
  { en: "Ar Rayaynah", ar: "الريانيه" }, { en: "Ar Rajban", ar: "الرجبان" },
  { en: "Ar Ruhaybat", ar: "الرحيبات" }, { en: "Al Josh", ar: "الجوش" }, { en: "Samnu", ar: "سمنه" },
  { en: "Ghudwah", ar: "غدوة" }, { en: "Tmassah", ar: "تمسه" }, { en: "Al Awaynat", ar: "العوينات" },
  { en: "Al Barkat", ar: "البركت" }, { en: "Traghen", ar: "تراغن" }, { en: "Riqdalin", ar: "رقدالين" },
  { en: "Zaltan", ar: "زلطن" }, { en: "Badr", ar: "بدر" }, { en: "Tiji", ar: "تيجي" },
  { en: "Tamzin", ar: "طمزين" }, { en: "Kabo", ar: "كابو" }, { en: "Wazzan", ar: "وزان" },
  { en: "Al Qal'ah", ar: "القلعه" }, { en: "Al Sa'diyah", ar: "الساعديه" }, { en: "Espiaa", ar: "السبيعة" },
  { en: "Al Maya", ar: "الماية" }, { en: "Al Shwayrif", ar: "الشويرف" }, { en: "Derj", ar: "درج" },
  { en: "Sinawan", ar: "سيناون" }, { en: "Zillah", ar: "زلة" }, { en: "Al Fuqaha", ar: "الفقهاء" },
  { en: "Umm al Aranib", ar: "أم الأرانب" }, { en: "Zuwaylah", ar: "زويلة" }, { en: "Ashkidah", ar: "أشكدة" },
  { en: "Wadi Utbah", ar: "وادي عتبة" }, { en: "Bint Bayya", ar: "بنت بية" }
];

/** Banks offered in the payout / withdrawal forms.
 *
 *  The Arabic name is the stored value — it is what is already sitting in
 *  every profile's payout_bank_name — so it stays the key and only the label
 *  changes with the language. */
export const PAYOUT_BANKS = [
  "محفظة paynow", "محفظة RUNPAY", "مصرف الصحاري", "مصرف السراج الاسلامي", "تطبيق التداول",
  "مصرف التضامن", "مصرف المتحد", "مصرف الجمهورية", "مصرف الواحة", "مصرف الامان",
  "مصرف التجارة والتنمية", "مصرف ليبيا المركزي - بنغازي", "مصرف الضمان الاسلامي", "محفظة GPAY",
  "Hawelli حولي", "مصرف التمويل الإسلامي", "مصرف الاسلامي الليبي", "Libo Pay", "مصرف المتوسط",
  "مصرف شمال افريقيا", "مصرف التجاري الوطني", "مصرف الاتحاد الوطني",
];

/* The name each of these banks trades under in English, taken from the Central
 * Bank of Libya's own register rather than translated.
 *
 * There is no rule to derive these. Some Libyan banks carry a translated name
 * — مصرف شمال افريقيا really is North Africa Bank — and some carry the Arabic
 * word transliterated, so مصرف الوحدة is Wahda Bank and not Unity Bank, and
 * مصرف الجمهورية is Jumhouria Bank and not Republic Bank. Translating them
 * would produce names that no Libyan bank answers to and that no marketer
 * could match against their own bank card. */
export const PAYOUT_BANK_EN: Record<string, string> = {
  "مصرف الجمهورية": "Jumhouria Bank",
  "مصرف الامان": "Aman Bank",
  "مصرف التجارة والتنمية": "Bank of Commerce & Development",
  "مصرف ليبيا المركزي - بنغازي": "Central Bank of Libya — Benghazi",
  "مصرف الضمان الاسلامي": "Daman Islamic Bank",
  "محفظة GPAY": "GPAY Wallet",
  "مصرف التمويل الإسلامي": "Islamic Finance Bank",
  "مصرف الاسلامي الليبي": "Libyan Islamic Bank",
  "مصرف المتوسط": "Mediterranean Bank",
  "مصرف شمال افريقيا": "North Africa Bank",
  "مصرف التجاري الوطني": "National Commercial Bank",
  "مصرف الاتحاد الوطني": "National Union Bank",
  "محفظة paynow": "PayNow Wallet",
  "محفظة RUNPAY": "RunPay Wallet",
  "مصرف الصحاري": "Sahara Bank",
  "مصرف السراج الاسلامي": "Al Seraj Islamic Bank",
  "تطبيق التداول": "Tadawul App",
  "مصرف التضامن": "Tadhamon Bank",
  "مصرف المتحد": "United Bank for Commerce & Investment",
  "مصرف الواحة": "Alwaha Bank",
  // Already Latin in the Arabic list — these two write themselves this way.
  "Hawelli حولي": "Hawelli",
  "Libo Pay": "Libo Pay",
};

/** The bank as it should read in the language on screen. Anything not in the
 *  list — an older stored value, a bank added since — is left alone. */
export const bankLabel = (v: unknown, ar: boolean): string => {
  const s = String(v ?? "");
  return ar ? s : PAYOUT_BANK_EN[s] || s;
};

export const PAYOUT_METHODS = ["One pay", "Bank of Unity", "Libyana Credit", "Madar Credit"];

export const ADMIN_WHATSAPP = "218915756638";
export const ADMIN_WHATSAPP_DISPLAY = "+218 91 575 6638";

/** Company deposit account shown in the "how to collect fee" instructions. */
export const DEPOSIT_ACCOUNT_NAME = "ناهد اسامة ادريس خريط";
export const DEPOSIT_ACCOUNT_NUMBER = "098022398240018";

/** Legacy size/colour are derived from the variant GROUP NAME, never from the
    group's position — businesses can order and name their groups freely. */
export const SIZE_GROUP_NAMES = ["size", "sizes", "مقاس", "المقاس", "مقاسات", "المقاسات", "حجم", "الحجم"];
export const COLOR_GROUP_NAMES = ["color", "colour", "colors", "colours", "لون", "اللون", "الوان", "الألوان", "الالوان"];

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How many points the main chart shows before it needs panning. */
export const CHART_VISIBLE: Record<string, number> = { D: 7, M: 6, Y: 6 };
