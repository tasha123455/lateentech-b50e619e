import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { translate } from "./dictionary";
import { rememberLang, swapLang, withLang as withLangPath, type Lang } from "./langPath";

export type { Lang };

type LanguageState = {
  lang: Lang;
  dir: "ltr" | "rtl";
  /** Prepend the current language prefix to a logical path (e.g. "/dashboard" -> "/en/dashboard"). */
  withLang: (path: string) => string;
  /** Path to the equivalent page in the OTHER language tree. */
  otherLangPath: string;
  otherLang: Lang;
};

const Ctx = createContext<LanguageState | null>(null);

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
// walkAndTranslate() scans the rendered DOM and swaps text nodes/attributes
// whose full trimmed content matches a dictionary key. It CANNOT distinguish
// "static app label" from "user-typed value" (product name, custom variant,
// typed note, etc.). Any user-typed value rendered anywhere in the DOM must
// be wrapped in a `data-no-i18n` element (or via the `row(k, v, noTranslate)`
// helper in the dashboard scripts). Do NOT wrap fixed-vocabulary values
// (country, city, category, order status) — those should translate normally.
// ─────────────────────────────────────────────────────────────────────────
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.closest("[data-no-i18n]")) return true;
  return false;
}

function shouldSkipAttrs(el: Element): boolean {
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") return true;
  if (el.closest("[data-no-i18n]")) return true;
  return false;
}

function walkAndTranslate(root: Node, lang: Lang) {
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

  if (root.nodeType === Node.ELEMENT_NODE) {
    const rootEl = root as Element;
    if (!shouldSkipAttrs(rootEl)) applyAttributes(rootEl, lang);
    rootEl.querySelectorAll("*").forEach((el) => {
      if (!shouldSkipAttrs(el)) applyAttributes(el, lang);
    });
  }
}

/**
 * LanguageProvider is now driven by the route it's mounted under.
 *
 * Each of the two language layout routes (`/en`, `/ar`) renders this
 * provider with a fixed `lang` prop. There is NO in-place toggle any more:
 * switching languages navigates to the sibling route tree, which unmounts
 * this provider and mounts a fresh one committed to the other language.
 * This is the whole reason we did the /en /ar split — no runtime flip.
 */
export function LanguageProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const otherLang: Lang = lang === "en" ? "ar" : "en";
  const otherLangPath = swapLang(pathname, otherLang);
  const withLang = useCallback((p: string) => withLangPath(lang, p), [lang]);

  // Persist so the next cold visit lands on the same tree.
  useEffect(() => { rememberLang(lang); }, [lang]);

  // Apply dir/lang + translate synchronously before paint. Runs once per
  // provider mount — no toggle, no flip.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", dir);
    body.classList.toggle("lang-ar", lang === "ar");
    body.classList.toggle("lang-en", lang === "en");
    walkAndTranslate(body, lang);
    try {
      const w = window as unknown as { __lateenLang?: Lang };
      w.__lateenLang = lang;
    } catch { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent("lateen-lang", { detail: { lang } }));
    } catch { /* ignore */ }
  }, [lang, dir]);

  // Legacy hook used by inline onclick handlers inside the dashboard body
  // HTML files: `window.__lateenToggleLang && window.__lateenToggleLang()`.
  // Now it just navigates to the sibling language tree.
  useEffect(() => {
    const w = window as unknown as { __lateenToggleLang?: () => void };
    w.__lateenToggleLang = () => {
      try { window.location.assign(otherLangPath); } catch { /* ignore */ }
    };
    return () => { try { delete w.__lateenToggleLang; } catch { /* ignore */ } };
  }, [otherLangPath]);

  // MutationObserver for dynamically-inserted DOM (dashboard shells inject
  // markup via innerHTML). Only needed for Arabic; English uses source text
  // as-is.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (lang !== "ar") return;

    let scheduled = false;
    let observing = true;
    const pendingNodes = new Set<Node>();
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") m.addedNodes.forEach((node) => pendingNodes.add(node));
        else if (m.type === "characterData") pendingNodes.add(m.target);
        else if (m.type === "attributes") pendingNodes.add(m.target);
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

  const value = useMemo<LanguageState>(
    () => ({ lang, dir, withLang, otherLangPath, otherLang }),
    [lang, dir, withLang, otherLangPath, otherLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanguage() {
  const v = useContext(Ctx);
  if (v) return v;
  // Fallback for components rendered outside a language layout (e.g. root-shell
  // widgets like <InstallPrompt />). Derive from the current URL if possible.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const lang: Lang = /^\/ar(\/|$)/.test(path) ? "ar" : "en";
  const dir: Dir = lang === "ar" ? "rtl" : "ltr";
  const withLangFn = (p: string) => (p.startsWith("/") ? `/${lang}${p}` : p);
  const otherLang: Lang = lang === "ar" ? "en" : "ar";
  const otherLangPath = `/${otherLang}`;
  return { lang, dir, withLang: withLangFn, otherLangPath, otherLang } as LanguageState;
}

/** Convenience — return a lang-prefixed path for the current tree. */
export function useLangPath(): (path: string) => string {
  return useLanguage().withLang;
}

/**
 * Floating language switcher. Renders a real router `<Link>` to the sibling
 * language tree, which triggers a fresh mount of the /en or /ar layout —
 * no in-place content flip.
 */
export function FloatingLanguageToggle() {
  const { lang, dir, otherLangPath } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const suffix = pathname.replace(/^\/(en|ar)(?=\/|$)/, "");
  const showOnly = suffix === "" || suffix === "/";
  if (!showOnly) return null;
  const label = lang === "en" ? "العربية" : "English";
  return (
    <Link
      data-no-i18n
      to={otherLangPath}
      aria-label="Toggle language"
      style={{
        position: "fixed",
        top: "calc(18px + env(safe-area-inset-top, 0px))",
        [dir === "rtl" ? "right" : "left"]: "calc(18px + env(safe-area-inset-left, 0px))",
        zIndex: 60,
        maxWidth: "calc(100dvw - 36px)",
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
        textDecoration: "none",
        fontFamily:
          lang === "ar"
            ? "'Segoe UI', 'Tahoma', 'Noto Sans Arabic', system-ui, sans-serif"
            : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>🌐</span>
      <span>{label}</span>
    </Link>
  );
}
