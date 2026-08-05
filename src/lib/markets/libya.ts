/**
 * Libya. The first market, and for now the only one.
 *
 * Every value the app needs that is true of Libya and not of anywhere else
 * lives in this file. It was gathered from thirty-odd places across the app —
 * the fee constants, the withdrawal minimum, the phone rule, the bank list,
 * the support number, the deposit account, the city list, the date locale —
 * so that a second market is a second file rather than a search through the
 * whole codebase.
 *
 * The values here are exactly what the app used before they were collected.
 * Nothing was corrected or rounded on the way in.
 *
 * The money figures are duplicated in the `markets` table, because the
 * withdrawal rules are enforced in the database where the balances are. The
 * two have to be changed together; see supabase/migrations for that row.
 */

import type { MarketCity, MarketSpec } from "./types";

/* Ordered biggest first, by district, the way the pickers show them. */
const CITIES: MarketCity[] = [
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

/* The Arabic name is the stored value — it is what is already sitting in
   every profile's payout_bank_name — so it stays the key and only the label
   changes with the language. */
const BANKS: string[] = [
  "محفظة paynow", "محفظة RUNPAY", "مصرف الصحاري", "مصرف السراج الاسلامي", "تطبيق التداول",
  "مصرف التضامن", "مصرف المتحد", "مصرف الجمهورية", "مصرف الواحة", "مصرف الامان",
  "مصرف التجارة والتنمية", "مصرف ليبيا المركزي - بنغازي", "مصرف الضمان الاسلامي", "محفظة GPAY",
  "Hawelli حولي", "مصرف التمويل الإسلامي", "مصرف الاسلامي الليبي", "Libo Pay", "مصرف المتوسط",
  "مصرف شمال افريقيا", "مصرف التجاري الوطني", "مصرف الاتحاد الوطني",
];

/* The name each of these banks trades under in English, taken from the
 * Central Bank of Libya's own register rather than translated.
 *
 * There is no rule to derive these. Some Libyan banks carry a translated name
 * — مصرف شمال افريقيا really is North Africa Bank — and some carry the Arabic
 * word transliterated, so مصرف الوحدة is Wahda Bank and not Unity Bank, and
 * مصرف الجمهورية is Jumhouria Bank and not Republic Bank. Translating them
 * would produce names that no Libyan bank answers to and that no marketer
 * could match against their own bank card. */
const BANK_NAMES_EN: Record<string, string> = {
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

export const LIBYA: MarketSpec = {
  code: "LY",
  nameEn: "Libya",
  nameAr: "ليبيا",
  flag: "🇱🇾",

  money: {
    currencyCode: "LYD",
    currencySymbol: "د.ل",
    // 5% of the unit price above 100 LYD, a flat 5 LYD at or below it.
    // Always based on the single-unit price, never on price × qty.
    fee: { pct: 0.05, fixed: 5, threshold: 100 },
    minWithdraw: 20,
    payoutCycleDays: 30,
    refundWindowDays: 2,
  },

  contact: {
    dialCode: "+218",
    localPhone: /^09[1-4]\d{7}$/,
    phoneHintEn: "Phone must be 10 digits and start with 091, 092, 093, or 094",
    phoneHintAr: "رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094",
    supportWhatsapp: "218915756638",
    supportWhatsappDisplay: "+218 91 575 6638",
  },

  payout: {
    banks: BANKS,
    bankNamesEn: BANK_NAMES_EN,
    methods: [
      { value: "One pay", labelEn: "One pay", labelAr: "وان باي" },
      // Tied to one institution, so the bank picker is locked out. "Bank of
      // Unity" is the stored value and cannot move without rewriting every
      // profile that already carries it; the bank's own English name is Wahda
      // Bank — الوحدة transliterated, not translated — so it is fixed here, at
      // the label.
      { value: "Bank of Unity", labelEn: "Wahda Bank", labelAr: "مصرف الوحده", fixedBank: true },
      {
        value: "Libyana Credit", labelEn: "Libyana Credit", labelAr: "رصيد ليبيانا",
        phonePrefixes: ["092", "094"],
        phoneHintEn: "Number starts with 092 or 094", phoneHintAr: "الرقم يبدا من 092 او 094",
      },
      {
        value: "Madar Credit", labelEn: "Madar Credit", labelAr: "رصيد مدار",
        phonePrefixes: ["091", "093"],
        phoneHintEn: "Number starts with 091 or 093", phoneHintAr: "الرقم يبدا من 091 او 093",
      },
    ],
    depositAccountName: "ناهد اسامة ادريس خريط",
    depositAccountNumber: "098022398240018",
  },

  places: { cities: CITIES },

  formats: {
    dateLocaleEn: "en-GB",
    dateLocaleAr: "ar-LY",
    // Libya sits at UTC+2 the whole year — no daylight saving to straddle.
    timeZone: "Africa/Tripoli",
  },
};
