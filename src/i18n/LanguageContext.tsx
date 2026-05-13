import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, RTL_CODES } from "./locales";
import { T, translate } from "./translations";

const STORAGE_KEY = "lateen_lang";

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

function readInitial(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && LOCALES.some((l) => l.code === v)) return v;
  } catch { /* ignore */ }
  return null;
}

function applyHtmlAttrs(code: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_CODES.has(code) ? "rtl" : "ltr";
}

function exposeGlobals(code: string) {
  if (typeof window === "undefined") return;
  const g = window as unknown as { __lang?: string; __t?: (k: string) => string };
  g.__lang = code;
  g.__t = (k: string) => translate(k, code);
}

/**
 * Walks the DOM and replaces text content of leaf nodes whose trimmed text
 * matches a known dictionary key. Also translates placeholder/title/aria-label
 * attributes. Skips inputs, scripts, style, and elements marked data-i18n-skip.
 */
export function translateDOM(root: HTMLElement | Document, code: string) {
  if (code === "en") return; // English needs no rewrite; original text stays.
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-i18n-skip]")) return NodeFilter.FILTER_REJECT;
      const txt = (node.nodeValue || "").trim();
      if (!txt) return NodeFilter.FILTER_REJECT;
      return T[txt] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const node of nodes) {
    const original = (node.nodeValue || "").trim();
    const translated = translate(original, code);
    if (translated !== original) {
      const lead = (node.nodeValue || "").match(/^\s*/)?.[0] ?? "";
      const tail = (node.nodeValue || "").match(/\s*$/)?.[0] ?? "";
      node.nodeValue = lead + translated + tail;
    }
  }
  // Translate common attributes
  const attrTargets = (root instanceof Document ? root.body : root).querySelectorAll(
    "[placeholder],[title],[aria-label]",
  );
  attrTargets.forEach((el) => {
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v && T[v.trim()]) {
        el.setAttribute(attr, translate(v.trim(), code));
      }
    }
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>("en");
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const initial = readInitial() ?? "en";
    setLangState(initial);
    applyHtmlAttrs(initial);
    exposeGlobals(initial);
    setReady(true);
  }, []);

  const setLang = useCallback((code: string) => {
    if (!LOCALES.some((l) => l.code === code)) return;
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    setLangState(code);
    applyHtmlAttrs(code);
    exposeGlobals(code);
    // Notify dashboards to re-walk
    window.dispatchEvent(new CustomEvent("lateen:lang", { detail: code }));
  }, []);

  const t = useCallback((key: string) => translate(key, lang), [lang]);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t, ready, open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }),
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
  return readInitial() !== null;
}
