import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, RTL_CODES } from "./locales";
import { T } from "./translations";

const STORAGE_KEY = "lateen_lang";
const DEFAULT_LANG = "ar";

type Ctx = {
  lang: string;
  setLang: (code: string) => void;
  t: (key: string) => string;
  ready: boolean;
  open: () => void;
  isOpen: boolean;
  close: () => void;
};

const LanguageContext = createContext<Ctx | null>(null);

function readInitial(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && LOCALES.some((l) => l.code === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

function applyHtmlAttrs(code: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_CODES.has(code) ? "rtl" : "ltr";
}

// Safe placeholder export to prevent compilation errors in other files
export function translateDOM(root: HTMLElement | Document, code: string) {
  return;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(() => readInitial());
  const [isOpen, setIsOpen] = useState(false);

  useLayoutEffect(() => {
    applyHtmlAttrs(lang);
    if (typeof window !== "undefined") {
      (window as unknown as { __lang?: string }).__lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((code: string) => {
    if (!LOCALES.some((l) => l.code === code)) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    setLangState(code);
  }, []);

  const t = useCallback(
    (key: string) => {
      if (lang === "en") return key;
      return T[key]?.[lang] ?? key;
    },
    [lang],
  );

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t,
      ready: true,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }),
    [lang, setLang, t, isOpen],
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
    const v = window.localStorage.getItem(STORAGE_KEY);
    return !!(v && LOCALES.some((l) => l.code === v));
  } catch {
    return false;
  }
}
