import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
    if (!shouldSkip(rootEl)) applyAttributes(rootEl, lang);
    rootEl.querySelectorAll("*").forEach((el) => {
      if (!shouldSkip(el)) applyAttributes(el, lang);
    });
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "ar" ? "ar" : "en";
  });
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
  }, [lang, dir]);

  // Observe dynamically inserted nodes — ONLY when Arabic is active.
  // In English (default) we skip all DOM observation to keep the app fast.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (lang !== "ar") return;

    let scheduled = false;
    const pendingNodes = new Set<Node>();
    const flush = () => {
      scheduled = false;
      for (const node of pendingNodes) {
        if (!node.isConnected) continue;
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = (node as Text).parentElement;
          if (parent && !shouldSkip(parent)) applyTextNode(node as Text, "ar");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          walkAndTranslate(node, "ar");
        }
      }
      pendingNodes.clear();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (ric) ric(flush);
      else setTimeout(flush, 50);
    };

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((node) => pendingNodes.add(node));
        } else if (m.type === "characterData") {
          pendingNodes.add(m.target);
        }
      }
      if (pendingNodes.size) schedule();
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
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
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  const label = lang === "en" ? "العربية" : "English";
  const side = dir === "rtl" ? { left: 16 } : { right: 16 };
  return (
    <button
      type="button"
      onClick={toggle}
      data-no-i18n
      aria-label="Toggle language"
      style={{
        position: "fixed",
        top: 16,
        ...side,
        zIndex: 99999,
        height: 36,
        padding: "0 14px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(20,20,20,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        color: "#f0eeeb",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: lang === "ar"
          ? "'Segoe UI', 'Tahoma', 'Noto Sans Arabic', system-ui, sans-serif"
          : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>🌐</span>
      <span>{label}</span>
    </button>
  );
}
