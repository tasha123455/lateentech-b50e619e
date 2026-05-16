export type Locale = {
  code: string;
  name: string;
  native: string;
  rtl?: boolean;
};

export const LOCALES: Locale[] = [
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "en", name: "English", native: "English" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
];

export const RTL_CODES = new Set(LOCALES.filter((locale) => locale.rtl).map((locale) => locale.code));
