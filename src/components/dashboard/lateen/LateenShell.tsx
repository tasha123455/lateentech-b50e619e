import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import businessBody from "./business.body.html?raw";
import marketerBody from "./marketer.body.html?raw";
import businessScript from "./business.script.js?raw";
import marketerScript from "./marketer.script.js?raw";
import { DICTS } from "@/i18n/dict";
import "@/styles/lateen-business.css";
import "@/styles/lateen-marketer.css";

const CHART_SRC = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";

let chartPromise: Promise<void> | null = null;
function loadChartJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { Chart?: unknown }).Chart) return Promise.resolve();
  if (chartPromise) return chartPromise;
  chartPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHART_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Chart.js failed to load"));
    document.head.appendChild(s);
  });
  return chartPromise;
}

type Role = "business" | "marketer";

function buildScript(src: string): string {
  const names = [...src.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  const exports = names.length ? `Object.assign(window, { ${names.join(", ")} });` : "";
  return `(function(){\n${src}\n${exports}\n})();`;
}

// Walk a root and translate text nodes + common attributes against the active dict.
// Stores the original English source on each node so re-translation works on lang change.
const ORIG_TEXT = "__lateenOrigText";
const ORIG_ATTR = "__lateenOrigAttrs";
const ATTRS_TO_TRANSLATE = ["placeholder", "title", "aria-label", "alt"];

function translateTree(root: HTMLElement, dict: Record<string, string>) {
  // Text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) { nodes.push(n as Text); n = walker.nextNode(); }
  for (const node of nodes) {
    type TextWithOrig = Text & { [ORIG_TEXT]?: string };
    const tn = node as TextWithOrig;
    const original = tn[ORIG_TEXT] ?? node.nodeValue ?? "";
    const trimmed = original.trim();
    if (!trimmed) continue;
    if (!tn[ORIG_TEXT]) tn[ORIG_TEXT] = original;
    const translated = dict[trimmed];
    if (translated) {
      // preserve surrounding whitespace
      node.nodeValue = original.replace(trimmed, translated);
    } else {
      node.nodeValue = original;
    }
  }
  // Attributes
  const els = root.querySelectorAll<HTMLElement>("[placeholder], [title], [aria-label], [alt]");
  els.forEach((el) => {
    type ElWithOrig = HTMLElement & { [ORIG_ATTR]?: Record<string, string> };
    const e = el as ElWithOrig;
    if (!e[ORIG_ATTR]) {
      const o: Record<string, string> = {};
      for (const a of ATTRS_TO_TRANSLATE) { const v = el.getAttribute(a); if (v) o[a] = v; }
      e[ORIG_ATTR] = o;
    }
    const orig = e[ORIG_ATTR]!;
    for (const a of ATTRS_TO_TRANSLATE) {
      const ov = orig[a]; if (ov == null) continue;
      const t = ov.trim();
      el.setAttribute(a, dict[t] ? ov.replace(t, dict[t]) : ov);
    }
  });
}

export function LateenShell({ role }: { role: Role }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();
  const { lang } = useLang();

  // Inject dashboard JS once per role
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let injected: HTMLScriptElement | null = null;

    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest('[data-action="sign-out"]');
      if (target) { e.preventDefault(); void signOut(); }
    };
    el.addEventListener("click", onClick);

    loadChartJs().then(() => {
      if (cancelled) return;
      const script = document.createElement("script");
      script.textContent = buildScript(role === "business" ? businessScript : marketerScript);
      document.body.appendChild(script);
      injected = script;
      // Re-translate after script populates dynamic content
      requestAnimationFrame(() => {
        if (containerRef.current) translateTree(containerRef.current, DICTS[lang] ?? {});
      });
    }).catch((err) => console.error("[Lateen] failed", err));

    // Observe dynamic DOM changes from dashboard script and re-translate
    const observer = new MutationObserver(() => {
      if (containerRef.current) translateTree(containerRef.current, DICTS[(window as unknown as { __lang?: string }).__lang ?? "en"] ?? {});
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      el.removeEventListener("click", onClick);
      if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, signOut]);

  // Re-translate whenever language changes
  useEffect(() => {
    if (containerRef.current) translateTree(containerRef.current, DICTS[lang] ?? {});
  }, [lang]);

  const body = role === "business" ? businessBody : marketerBody;

  return (
    <div className={`relative lateen-${role}`}>
      <div className="absolute right-3 top-3 z-40"><LanguageSwitcher /></div>
      <div
        ref={containerRef}
        // Trusted, build-time HTML asset bundled with the app.
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}
