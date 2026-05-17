import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCALES, RTL_CODES } from "./locales";
import { T } from "./translations";

// 100% static, hardcoded dictionary translation system.
// No AI. No MutationObserver. No network calls. No caches.

const STORAGE_KEY = "lateen_lang";
const DEFAULT_LANG = "ar";

// Skip strings that are pure numbers / money / time / symbols.
const SKIP_RE = /^[\s\d.,:;%$€£¥₹\-+/()*#@~_=<>&|·•—–…«»‹›"'`!?\\[\]{}]+$/;
const MAX_LEN = 800;

function shouldSkip(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > MAX_LEN) return true;
  if (SKIP_RE.test(t)) return true;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t)) return true;
  return false;
}

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

function lookup(text: string, code: string): string {
  if (code === "en") return text;
  return T[text]?.[code] ?? text;
}

// ── DOM walker (static-only) ─────────────────────────────
// Used exclusively to translate the embedded HTML dashboards
// (business/marketer/admin) that are injected via dangerouslySetInnerHTML.
// React components themselves use the t() function directly.
export function translateDOM(root: HTMLElement | Document, code: string) {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-i18n-skip]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tnode = n as Text & { __orig?: string; __translated?: string };
    const current = tnode.nodeValue ?? "";
    // Capture the source text the first time we see this node, or whenever
    // a dashboard script has replaced the previous translation with new English.
    if (
      tnode.__orig === undefined ||
      (tnode.__translated !== undefined && current !== tnode.__translated)
    ) {
      tnode.__orig = current;
    }
    const raw = tnode.__orig ?? current;
    const stripped = raw.trim();
    if (shouldSkip(stripped)) continue;
    const lead = raw.match(/^\s*/)?.[0] ?? "";
    const tail = raw.match(/\s*$/)?.[0] ?? "";
    const translated = lookup(stripped, code);
    const next = lead + translated + tail;
    if (tnode.nodeValue !== next) {
      tnode.nodeValue = next;
      tnode.__translated = next;
    }
  }

  const root2 = root instanceof Document ? root.body : (root as Element);
  if (!root2) return;
  root2.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      if (el.closest("[data-i18n-skip]")) continue;
      const elx = el as Element & Record<string, string | undefined>;
      const origKey = `__orig_${attr}`;
      const translatedKey = `__translated_${attr}`;
      if (
        elx[origKey] === undefined ||
        (elx[translatedKey] !== undefined && v !== elx[translatedKey])
      ) {
        elx[origKey] = v;
      }
      const raw = (elx[origKey] as string).trim();
      if (shouldSkip(raw)) continue;
      const translated = lookup(raw, code);
      if (el.getAttribute(attr) !== translated) {
        el.setAttribute(attr, translated);
        elx[translatedKey] = translated;
      }
    }
  });
}

// ── Provider ──────────────────────────────────────────
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(() => readInitial());
  const [isOpen, setIsOpen] = useState(false);

  // Apply lang + dir BEFORE paint to avoid any flicker.
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
