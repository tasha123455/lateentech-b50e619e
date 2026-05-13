import { useEffect, useRef, useState } from "react";
import { LOCALES } from "./locales";
import { useLang } from "./LanguageContext";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = LOCALES.find((l) => l.code === lang) ?? LOCALES[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("Language")}
        className="flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs text-text-1 transition hover:bg-surface-2"
      >
        <GlobeIcon />
        <span className="font-medium">{current.native}</span>
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 max-h-72 w-56 overflow-auto rounded-2xl border border-border bg-surface p-1 shadow-xl">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2 ${
                l.code === lang ? "bg-surface-2 text-text-1" : "text-text-2"
              }`}
            >
              <span>
                <span className="block font-medium text-text-1">{l.native}</span>
                <span className="block text-[11px] text-text-3">{l.name}</span>
              </span>
              {l.code === lang && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
