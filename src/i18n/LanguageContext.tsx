import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, LOCALE_BY_CODE } from "./locales";
import { DICTS, type Dict } from "./dict";

const STORAGE_KEY = "lateen_lang";
const DEFAULT_LANG = "en";

type LanguageState = {
  lang: string;
  isRtl: boolean;
  ready: boolean;        // true after first hydration from localStorage
  hasChosen: boolean;    // true if user picked a language at least once
  setLang: (code: string) => void;
  t: (key: string) => string;
};

const Ctx = createContext<LanguageState | null>(null);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function applyDocument(lang: string, isRtl: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
}

function publishGlobal(lang: string, dict: Dict) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __T?: Dict; __lang?: string; __i18nVersion?: number; dispatchEvent: typeof window.dispatchEvent };
  w.__T = dict;
  w.__lang = lang;
  w.__i18nVersion = (w.__i18nVersion ?? 0) + 1;
  try { window.dispatchEvent(new CustomEvent("lateen:lang", { detail: { lang } })); } catch { /* noop */ }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(DEFAULT_LANG);
  const [hasChosen, setHasChosen] = useState(false);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on first client render
  useEffect(() => {
    const stored = readStored();
    if (stored && LOCALE_BY_CODE[stored]) {
      setLangState(stored);
      setHasChosen(true);
    }
    setReady(true);
  }, []);

  const isRtl = !!LOCALE_BY_CODE[lang]?.rtl;

  // Sync html dir/lang and globals whenever lang changes
  useEffect(() => {
    applyDocument(lang, isRtl);
    publishGlobal(lang, DICTS[lang] ?? {});
  }, [lang, isRtl]);

  const setLang = useCallback((code: string) => {
    if (!LOCALE_BY_CODE[code]) return;
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* noop */ }
    setLangState(code);
    setHasChosen(true);
  }, []);

  const t = useCallback(
    (key: string) => {
      const dict = DICTS[lang];
      if (!dict) return key;
      return dict[key] ?? key;
    },
    [lang],
  );

  const value = useMemo<LanguageState>(
    () => ({ lang, isRtl, ready, hasChosen, setLang, t }),
    [lang, isRtl, ready, hasChosen, setLang, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLang must be used within LanguageProvider");
  return v;
}

export function useT() {
  return useLang().t;
}

export { LOCALES };
