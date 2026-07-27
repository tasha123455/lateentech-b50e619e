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
import { LateenLogo } from "@/components/brand/LateenLogo";

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

// ─────────────────────────────────────────────────────────────────────────
// IMPORTANT — read this before adding any new dashboard feature.
//
// walkAndTranslate() below scans the rendered DOM and swaps any text node
// whose full trimmed content exactly matches a dictionary key. It has NO
// way to tell "static app label" apart from "text a business/marketer/admin
// typed" — a product named "All", a custom variant type called "New", a
// typed note/address/review, etc. will get silently swapped to Arabic if it
// happens to match a dictionary word.
//
// Rule: any time you render a free-typed value into the DOM (product name,
// description, code, variant type/value names, notes, messages, addresses,
// review author/text, admin comments, etc.) in admin.script.js,
// business.script.js, or marketer.script.js, wrap it with `data-no-i18n` —
// either directly on the element, or via the existing `row(k, v, noTranslate)`
// helper pattern used throughout those files. Do this automatically as part
// of building the feature, not as a later cleanup pass.
//
// Do NOT wrap fixed-vocabulary/picker-driven values (country, city,
// category, order status labels) — those are meant to translate normally.
// ─────────────────────────────────────────────────────────────────────────
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

  // Read the stored preference in a LAYOUT effect, not a passive useEffect.
  // useEffect callbacks run *after* the browser has already painted, so an
  // Arabic-preferring user briefly saw the English tree on every load or
  // refresh before this flipped it. useLayoutEffect runs before paint, so
  // the flip (and the translation layout effect below) lands in the same
  // frame as hydration — no visible English flash first.
  useLayoutEffect(() => {
    try {
      // No auto-detection here: if nothing is stored yet, this is a first
      // visit and <LanguageGate> (rendered in the root shell) is solely
      // responsible for asking the user to choose and persisting it via
      // setLang below. We only read + apply an already-made choice.
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

  // Expose toggle + current lang globally so non-React HTML (dashboard bodies)
  // can call it from inline onclick handlers.
  useEffect(() => {
    const w = window as unknown as { __lateenToggleLang?: () => void; __lateenLang?: Lang };
    w.__lateenToggleLang = toggle;
    w.__lateenLang = lang;
  }, [toggle, lang]);

  // Flip dir/lang and translate synchronously in a layout effect — before
  // the browser paints — so there is no visible flicker/jitter on toggle.
  // Use the View Transitions API when available for a smooth cross-fade;
  // the opacity-based fallback was the source of the reported jitter.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const apply = () => {
      html.setAttribute("lang", lang);
      html.setAttribute("dir", dir);
      body.classList.toggle("lang-ar", lang === "ar");
      body.classList.toggle("lang-en", lang === "en");
      walkAndTranslate(body, lang);
      try { window.dispatchEvent(new CustomEvent("lateen-lang", { detail: { lang } })); } catch { /* ignore */ }
    };
    const docAny = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (typeof docAny.startViewTransition === "function") {
      docAny.startViewTransition(apply);
      return;
    }
    apply();
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
  const [show, setShow] = useState(false);
  useEffect(() => {
    setMounted(true);
    const check = () => {
      const p = window.location.pathname.replace(/\/+$/, "");
      setShow(p === "" || p === "/");
    };
    check();
    window.addEventListener("popstate", check);
    const id = window.setInterval(check, 400);
    return () => { window.removeEventListener("popstate", check); window.clearInterval(id); };
  }, []);
  if (!mounted || !show) return null;
  const label = lang === "en" ? "العربية" : "English";
  return (
    <button
      data-no-i18n
      type="button"
      onClick={toggle}
      aria-label="Toggle language"
      style={{
        position: "fixed",
        top: 14,
        [dir === "rtl" ? "left" : "right"]: 14,
        zIndex: 60,
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
      <span aria-hidden style={{ fontSize: 14 }}>🌐</span>
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// First-visit language gate. Shown once — before the person has ever chosen
// a language — as a full-screen, non-dismissible screen with two buttons
// (English / العربية). Once a choice is made it's persisted via setLang
// (same STORAGE_KEY the rest of this file reads), so this never appears
// again on later visits, sign-ins, or sign-outs. Uses the same
// layout-effect-before-paint technique as LanguageProvider above so there
// is no flash of the app underneath on a first visit.
export function LanguageGate() {
  const { setLang } = useLanguage();
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) setShow(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!show) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    let prevBody = "";
    let prevHtml = "";
    try {
      prevBody = document.body.style.overflow;
      prevHtml = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } catch { /* ignore */ }
    return () => {
      cancelAnimationFrame(raf);
      try {
        document.body.style.overflow = prevBody;
        document.documentElement.style.overflow = prevHtml;
      } catch { /* ignore */ }
    };
  }, [show]);

  const choose = useCallback((l: Lang) => {
    setLang(l);
    setShow(false);
  }, [setLang]);

  if (!show) return null;

  return (
    <div
      data-no-i18n
      role="dialog"
      aria-modal="true"
      aria-label="Choose your language / اختر لغتك"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0D0D0D",
        padding: 24,
      }}
    >
      <style>{`
        .lateen-lg-btn { transition: transform 150ms ease, background 150ms ease, border-color 150ms ease; }
        .lateen-lg-btn:active { transform: scale(0.98); }
        .lateen-lg-btn-en:hover { background: rgba(45,189,143,0.14); border-color: rgba(45,189,143,0.6); }
        .lateen-lg-btn-ar:hover { background: rgba(108,100,212,0.14); border-color: rgba(108,100,212,0.6); }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: 340,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 320ms ease, transform 380ms ease",
        }}
      >
        <div style={{ marginBottom: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <LateenLogo size={50} />
          <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 19, color: "#f0eeeb", letterSpacing: 0.2 }}>
            Wasla · وصلة
          </span>
        </div>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 21, fontWeight: 600, color: "#f0eeeb", marginBottom: 6 }}>
            Choose your language
          </div>
          <div
            dir="rtl"
            style={{
              fontSize: 21,
              fontWeight: 600,
              color: "#9e9b97",
              fontFamily: "'Segoe UI','Tahoma','Noto Sans Arabic',system-ui,sans-serif",
            }}
          >
            اختر لغتك
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <button
            type="button"
            className="lateen-lg-btn lateen-lg-btn-en"
            onClick={() => choose("en")}
            style={{
              height: 58,
              borderRadius: 14,
              border: "1px solid rgba(45,189,143,0.45)",
              background: "rgba(45,189,143,0.10)",
              color: "#f0eeeb",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            English
          </button>
          <button
            type="button"
            dir="rtl"
            className="lateen-lg-btn lateen-lg-btn-ar"
            onClick={() => choose("ar")}
            style={{
              height: 58,
              borderRadius: 14,
              border: "1px solid rgba(108,100,212,0.45)",
              background: "rgba(108,100,212,0.10)",
              color: "#f0eeeb",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Segoe UI','Tahoma','Noto Sans Arabic',system-ui,sans-serif",
            }}
          >
            العربية
          </button>
        </div>
      </div>
    </div>
  );
}

