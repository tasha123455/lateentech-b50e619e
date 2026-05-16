import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, RTL_CODES } from "./locales";
import { T, translate } from "./translations";
import { mergeCache, readCache } from "./aiCache";
import { translateBatch } from "@/lib/translate.functions";

const STORAGE_KEY = "lateen_lang";
const DEFAULT_LANG = "ar";

// Skip strings that are pure numbers / money / time / symbols.
// Examples that match (and stay English): "$1,290.00", "42%", "12:30", "—", "›", "100", "+44 7700 000000"
const SKIP_RE = /^[\s\d.,:;%$€£¥₹\-+/()*#@~_=<>&|·•—–…«»‹›"'`!?\\[\]{}]+$/;

// Skip very-long blobs (likely code or junk) to avoid huge AI calls.
const MAX_LEN = 800;

function shouldSkip(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > MAX_LEN) return true;
  if (SKIP_RE.test(t)) return true;
  // Skip if there are no letters at all (e.g. "1,290.00 USD" — leave the digits, "USD" is fine to keep English)
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
  const cache = readCache(code);
  g.__t = (k: string) => {
    if (code === "en") return k;
    const fromDict = T[k]?.[code];
    if (fromDict) return fromDict;
    if (cache[k]) return cache[k];
    return k;
  };
}

// ── Walker ────────────────────────────────────────────
type WalkResult = {
  textNodes: Array<{ node: Text; original: string }>;
  attrTargets: Array<{ el: Element; attr: string; original: string }>;
};

function collectTexts(root: Node): WalkResult {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const textNodes: WalkResult["textNodes"] = [];
  const attrTargets: WalkResult["attrTargets"] = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-i18n-skip]")) return NodeFilter.FILTER_REJECT;
      const txt = (node.nodeValue || "").trim();
      if (shouldSkip(txt)) return NodeFilter.FILTER_REJECT;
      // Cache the original English on first sight so we can re-translate later
      if (!(parent as HTMLElement).dataset) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tnode = n as Text;
    // Stash the latest source text. Dashboard scripts often replace text after the
    // first translation pass, so refresh the source when a script writes new English.
    const stash = tnode as Text & { __orig?: string; __translated?: string };
    const current = tnode.nodeValue || "";
    if (stash.__orig === undefined || (stash.__translated !== undefined && current !== stash.__translated)) {
      stash.__orig = current;
      stash.__translated = undefined;
    }
    const original = (stash.__orig || "").trim();
    if (!shouldSkip(original)) textNodes.push({ node: tnode, original });
  }

  const root2 = root instanceof Document ? root.body : (root as Element);
  if (root2) {
    root2.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const v = el.getAttribute(attr);
        if (!v) continue;
        if (el.closest("[data-i18n-skip]")) continue;
        const stashKey = `__orig_${attr}`;
        const translatedKey = `__translated_${attr}`;
        const elx = el as Element & Record<string, string | undefined>;
        if (elx[stashKey] === undefined || (elx[translatedKey] !== undefined && v !== elx[translatedKey])) {
          elx[stashKey] = v;
          elx[translatedKey] = undefined;
        }
        const original = (elx[stashKey] as string).trim();
        if (!shouldSkip(original)) attrTargets.push({ el, attr, original });
      }
    });
  }
  return { textNodes, attrTargets };
}

function lookup(text: string, code: string, cache: Record<string, string>): string | null {
  if (code === "en") return text; // restore English
  const dict = T[text]?.[code];
  if (dict) return dict;
  if (cache[text]) return cache[text];
  return null;
}

function applyTextNode(item: { node: Text; original: string }, translated: string) {
  const stash = item.node as Text & { __orig?: string; __translated?: string };
  const raw = stash.__orig ?? item.node.nodeValue ?? "";
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const tail = raw.match(/\s*$/)?.[0] ?? "";
  const next = lead + translated + tail;
  stash.__translated = next;
  item.node.nodeValue = next;
}

let inflight: Promise<void> | null = null;
let pending = new Set<string>();
let pendingCode = "";

async function flushAi(code: string, langName: string, root: HTMLElement | Document) {
  const phrases = Array.from(pending).slice(0, 100);
  pending = new Set(Array.from(pending).slice(100));
  if (phrases.length === 0) return;
  try {
    const { out } = await translateBatch({ data: { lang: code, langName, phrases } });
    const additions: Record<string, string> = {};
    phrases.forEach((p, i) => { if (out[i] && out[i] !== p) additions[p] = out[i]; });
    mergeCache(code, additions);
    exposeGlobals(code); // refresh window.__t cache view
    // Re-apply to current DOM
    applyToRoot(root, code, langName, /*alreadyFetching*/ true);
  } catch (e) {
    console.error("[i18n] AI translate failed", e);
  }
}

let isApplying = false;
export function isTranslating() { return isApplying; }

function applyToRoot(root: HTMLElement | Document, code: string, langName: string, alreadyFetching = false) {
  const { textNodes, attrTargets } = collectTexts(root);
  const cache = readCache(code);
  const missing = new Set<string>();

  isApplying = true;
  try {
    for (const item of textNodes) {
      const found = lookup(item.original, code, cache);
      if (found !== null) {
        if ((item.node.nodeValue || "").trim() !== found) applyTextNode(item, found);
      } else if (code !== "en") {
        missing.add(item.original);
      }
    }
    for (const item of attrTargets) {
      const found = lookup(item.original, code, cache);
      if (found !== null) {
        if (item.el.getAttribute(item.attr) !== found) item.el.setAttribute(item.attr, found);
        (item.el as Element & Record<string, string | undefined>)[`__translated_${item.attr}`] = found;
      } else if (code !== "en") {
        missing.add(item.original);
      }
    }
  } finally {
    // release on next microtask so the observer skips our own writes
    queueMicrotask(() => { isApplying = false; });
  }

  if (code === "en" || code === "ar" || alreadyFetching) return;
  if (missing.size === 0) return;

  // Queue + flush
  missing.forEach((m) => pending.add(m));
  pendingCode = code;
  if (!inflight) {
    inflight = new Promise<void>((resolve) => {
      // small debounce so multiple walks coalesce
      setTimeout(async () => {
        while (pending.size > 0 && pendingCode === code) {
          // eslint-disable-next-line no-await-in-loop
          await flushAi(code, langName, root);
        }
        inflight = null;
        resolve();
      }, 80);
    });
  }
}

export function translateDOM(root: HTMLElement | Document, code: string) {
  const langName = LOCALES.find((l) => l.code === code)?.name ?? code;
  applyToRoot(root, code, langName);
}

// ── Provider ──────────────────────────────────────────
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(() => readInitial() ?? DEFAULT_LANG);
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const initial = readInitial() ?? DEFAULT_LANG;
    setLangState(initial);
    applyHtmlAttrs(initial);
    exposeGlobals(initial);
    setReady(true);
    if (initial !== "en") {
      // Translate whatever's already on screen (landing/auth)
      requestAnimationFrame(() => translateDOM(document, initial));
    }
  }, []);

  // Global MutationObserver — translate any newly-added content
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ready) return;
    let scheduled = false;
    const obs = new MutationObserver((muts) => {
      if (lang === "en") return;
      if (isTranslating()) return;
      let needs = false;
      for (const m of muts) {
        if (m.type === "childList" && m.addedNodes.length) { needs = true; break; }
        if (m.type === "characterData") { needs = true; break; }
      }
      if (needs && !scheduled) {
        scheduled = true;
        setTimeout(() => { scheduled = false; translateDOM(document, lang); }, 60);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [ready, lang]);

  const setLang = useCallback((code: string) => {
    if (!LOCALES.some((l) => l.code === code)) return;
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    setLangState(code);
    applyHtmlAttrs(code);
    exposeGlobals(code);
    // For switch back to English, restore originals from stashes by walking & resetting
    if (code === "en") restoreOriginals(document);
    else translateDOM(document, code); // synchronous: no RAF gap = no flicker
    window.dispatchEvent(new CustomEvent("lateen:lang", { detail: code }));
  }, []);

  const t = useCallback((key: string) => {
    if (lang === "en") return key;
    const dict = T[key]?.[lang];
    if (dict) return dict;
    const c = readCache(lang);
    return c[key] ?? key;
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t, ready, open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }),
    [lang, setLang, t, ready, isOpen],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function restoreOriginals(root: Document) {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text & { __orig?: string };
    if (t.__orig !== undefined) t.nodeValue = t.__orig;
  }
  root.body?.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const stashKey = `__orig_${attr}`;
      const elx = el as Element & Record<string, string | undefined>;
      if (elx[stashKey] !== undefined) el.setAttribute(attr, elx[stashKey] as string);
    }
  });
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
