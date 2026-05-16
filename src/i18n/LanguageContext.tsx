import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, RTL_CODES } from "./locales";
import { T } from "./translations";

const STORAGE_KEY = "lateen_lang";
const DEFAULT_LANG = "ar";

export const DICTIONARY = T;

type LanguageCode = string;

type Ctx = {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => void;
  t: (key: string) => string;
  ready: boolean;
  open: () => void;
  isOpen: boolean;
  close: () => void;
};

const LanguageContext = createContext<Ctx | null>(null);
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isSupported(code: string) {
  return LOCALES.some((locale) => locale.code === code);
}

function readInitial(): LanguageCode {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isSupported(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function applyHtmlAttrs(code: LanguageCode) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_CODES.has(code) ? "rtl" : "ltr";
}

function exposeGlobals(code: LanguageCode, translator: (key: string) => string) {
  if (typeof window === "undefined") return;
  const global = window as unknown as {
    __lang?: string;
    __lateenT?: (key: string) => string;
    __t?: (key: string) => string;
  };
  global.__lang = code;
  global.__lateenT = translator;
  global.__t = translator;
}

export function translateKey(key: string, code: LanguageCode = DEFAULT_LANG): string {
  if (code === "en") return key;
  return DICTIONARY[key]?.[code] ?? key;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(() => readInitial());
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const t = useCallback((key: string) => translateKey(key, lang), [lang]);

  useIsoLayoutEffect(() => {
    applyHtmlAttrs(lang);
    exposeGlobals(lang, t);
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage can be unavailable in private browsing */
    }
    setReady(true);
  }, [lang, t]);

  const setLang = useCallback((code: LanguageCode) => {
    if (!isSupported(code)) return;
    applyHtmlAttrs(code);
    setLangState(code);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t,
      ready,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }),
    [lang, setLang, t, ready, isOpen],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}

export function useT() {
  return useLanguage().t;
}

export function hasStoredLanguage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
