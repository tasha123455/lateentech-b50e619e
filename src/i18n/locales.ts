export type Locale = {
  code: "en" | "ar";
  name: string;
  native: string;
  rtl?: boolean;
};

export const LOCALES: Locale[] = [
  { code: "en", name: "English", native: "English" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
];

export const RTL_CODES = new Set(LOCALES.filter((l) => l.rtl).map((l) => l.code));
