import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translate } from "./dictionary";

export type Lang = "en" | "ar";

type LanguageState = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  toggle: () => void;
};

const Ctx = createContext<LanguageState | null>(null);
const STORAGE_KEY = "lateen_lang";

// Cache original English content per node so toggling back is lossless.
const ORIG_TEXT = new WeakMap<Text, string>();
const ORIG_ATTR = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function rememberText(node: Text) {
  if (!ORIG_TEXT.has(node)) ORIG_TEXT.set(node, node.nodeValue ?? "");
}
function rememberAttr(el: Element, name: string) {
  let m = ORIG_ATTR.get(el);
  if (!m) { m = new Map(); ORIG_ATTR.set(el, m); }
  if (!m.has(name)) m.set(name, el.getAttribute(name) ?? "");
}

function applyTextNode(node: Text, lang: Lang) {
  if (lang === "en") {
    const orig = ORIG_TEXT.get(node);
    if (orig != null && node.nodeValue !== orig) node.nodeValue = orig;
    return;
  }
  rememberText(node);
  const orig = ORIG_TEXT.get(node) ?? node.nodeValue ?? "";
  const trimmed = orig.trim();
  if (!trimmed) return;
  const tr = translate(orig);
  if (tr == null) return;
  // Preserve surrounding whitespace
  const leading = orig.match(/^\s*/)?.[0] ?? "";
  const trailing = orig.match(/\s*$/)?.[0] ?? "";
  const next = leading + tr + trailing;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function applyAttributes(el: Element, lang: Lang) {
  for (const name of TRANSLATABLE_ATTRS) {
    if (!el.hasAttribute(name)) continue;
    if (lang === "en") {
      const m = ORIG_ATTR.get(el);
      const orig = m?.get(name);
      if (orig != null) el.setAttribute(name, orig);
      continue;
    }
    rememberAttr(el, name);
    const orig = ORIG_ATTR.get(el)?.get(name) ?? el.getAttribute(name) ?? "";
    const tr = translate(orig);
    if (tr != null) el.setAttribute(name, tr);
  }
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.closest("[data-no-i18n]")) return true;
  return false;
}

// Attributes (placeholder/title/aria-label/alt) are safe to translate even on
// TEXTAREA/INPUT — only user-typed text content must be preserved.
function shouldSkipAttrs(el: Element): boolean {
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") return true;
  if (el.closest("[data-no-i18n]")) return true;
  return false;
}

function walkAndTranslate(root: Node, lang: Lang) {
  // Translate text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null = walker.nextNode();
  while (n) { applyTextNode(n as Text, lang); n = walker.nextNode(); }

  // Translate attributes (including the root if it's an Element)
  if (root.nodeType === Node.ELEMENT_NODE) {
    const rootEl = root as Element;
    if (!shouldSkipAttrs(rootEl)) applyAttributes(rootEl, lang);
    rootEl.querySelectorAll("*").forEach((el) => {
      if (!shouldSkipAttrs(el)) applyAttributes(el, lang);
    });
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start in "en" on first render so client markup matches SSR exactly
  // (SSR has no localStorage). We then upgrade to the stored language inside
  // a useEffect — after hydration — to avoid React throwing away the tree.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "ar") setLangState("ar");
    } catch { /* ignore */ }
  }, []);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback(() => setLang(lang === "en" ? "ar" : "en"), [lang, setLang]);

  // Synchronously flip dir/lang before paint, then translate the entire body
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", dir);
    document.body.classList.toggle("lang-ar", lang === "ar");
    document.body.classList.toggle("lang-en", lang === "en");
    walkAndTranslate(document.body, lang);
    try { window.dispatchEvent(new CustomEvent("lateen-lang", { detail: { lang } })); } catch { /* ignore */ }
  }, [lang, dir]);

  // Observe dynamically inserted nodes — ONLY when Arabic is active.
  // In English (default) we skip all DOM observation to keep the app fast.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (lang !== "ar") return;

    let scheduled = false;
    let observing = true;
    const pendingNodes = new Set<Node>();
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((node) => pendingNodes.add(node));
        } else if (m.type === "characterData") {
          pendingNodes.add(m.target);
        } else if (m.type === "attributes") {
          pendingNodes.add(m.target);
        }
      }
      if (pendingNodes.size) schedule();
    });

    const startObserving = () => {
      if (observing) return;
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["placeholder", "title", "aria-label", "alt"],
      });
      observing = true;
    };

    const flush = () => {
      scheduled = false;
      obs.disconnect();
      observing = false;
      try {
        for (const node of pendingNodes) {
          if (!node.isConnected) continue;
          if (node.nodeType === Node.TEXT_NODE) {
            const parent = (node as Text).parentElement;
            if (parent && !shouldSkip(parent)) applyTextNode(node as Text, "ar");
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkAndTranslate(node, "ar");
          }
        }
      } finally {
        pendingNodes.clear();
        startObserving();
      }
    };
    // Synchronous microtask flush — translate inserted nodes before the
    // browser paints them, so Arabic UI never flickers through English.
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    };

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label", "alt"],
    });
    observing = true;
    return () => { obs.disconnect(); pendingNodes.clear(); };
  }, [lang]);

  const value = useMemo<LanguageState>(() => ({ lang, dir, setLang, toggle }), [lang, dir, setLang, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanguage() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLanguage must be used within LanguageProvider");
  return v;
}

export function FloatingLanguageToggle() {
  const { lang, dir, toggle } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  const label = lang === "en" ? "العربية" : "English";
  return (
    <div
      data-no-i18n
      style={{
        display: "flex",
        justifyContent: dir === "rtl" ? "flex-start" : "flex-end",
        padding: "12px 16px 0",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle language"
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(20,20,20,0.92)",
          color: "#f0eeeb",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily:
            lang === "ar"
              ? "'Segoe UI', 'Tahoma', 'Noto Sans Arabic', system-ui, sans-serif"
              : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <span aria-hidden style={{ fontSize: 14 }}>
          🌐
        </span>
        <span>{label}</span>
      </button>
    </div>
  );
}

