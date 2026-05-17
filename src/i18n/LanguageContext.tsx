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

// Cache original English text per node so toggling languages re-translates
// from the canonical key, not from previously-injected Arabic.
const ORIG_TEXT = new WeakMap<Text, string>();
const ORIG_ATTR = new WeakMap<Element, Record<string, string>>();
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function lookup(key: string, code: string): string {
  if (code === "en") return key;
  const v = T[key]?.ar;
  return v ?? key;
}

function translateText(node: Text, code: string) {
  const original = ORIG_TEXT.get(node) ?? node.nodeValue ?? "";
  if (!ORIG_TEXT.has(node)) ORIG_TEXT.set(node, original);
  const trimmed = original.trim();
  if (!trimmed) return;
  // Only translate if the whole trimmed string is a known key.
  const translated = lookup(trimmed, code);
  if (translated === trimmed && code !== "en") return;
  // Preserve surrounding whitespace.
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  const next = code === "en" ? original : leading + translated + trailing;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateAttrs(el: Element, code: string) {
  let orig = ORIG_ATTR.get(el);
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    if (!orig) { orig = {}; ORIG_ATTR.set(el, orig); }
    if (!(attr in orig)) orig[attr] = el.getAttribute(attr) ?? "";
    const original = orig[attr];
    const trimmed = original.trim();
    if (!trimmed) continue;
    const translated = lookup(trimmed, code);
    const next = code === "en" ? original : translated;
    if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
  }
}

export function translateDOM(root: HTMLElement | Document, code: string) {
  if (typeof document === "undefined") return;
  const rootEl = (root as Document).documentElement
    ? (root as Document).body || (root as Document).documentElement
    : (root as HTMLElement);
  if (!rootEl) return;

  // Walk text nodes.
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) translateText(n as Text, code);

  // Walk elements for attributes.
  const ewalker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, {
    acceptNode(el) {
      const e = el as Element;
      if (SKIP_TAGS.has(e.tagName)) return NodeFilter.FILTER_REJECT;
      if (e.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let e: Node | null;
  while ((e = ewalker.nextNode())) translateAttrs(e as Element, code);
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
      return T[key]?.ar ?? key;
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
