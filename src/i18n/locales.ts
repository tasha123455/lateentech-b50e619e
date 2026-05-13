export type Locale = { code: string; name: string; native: string; rtl?: boolean };

export const LOCALES: Locale[] = [
  { code: "en",    name: "English",             native: "English" },
  { code: "es",    name: "Spanish",             native: "Español" },
  { code: "fr",    name: "French",              native: "Français" },
  { code: "de",    name: "German",              native: "Deutsch" },
  { code: "pt-BR", name: "Portuguese (Brazil)", native: "Português" },
  { code: "ru",    name: "Russian",             native: "Русский" },
  { code: "ar",    name: "Arabic",              native: "العربية", rtl: true },
  { code: "hi",    name: "Hindi",               native: "हिन्दी" },
  { code: "zh-CN", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "ja",    name: "Japanese",            native: "日本語" },
];

export const LOCALE_BY_CODE: Record<string, Locale> = Object.fromEntries(LOCALES.map(l => [l.code, l]));
