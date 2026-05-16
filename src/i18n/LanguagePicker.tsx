import { useMemo, useState } from "react";
import { LOCALES } from "./locales";
import { useLanguage } from "./LanguageContext";

type Props = {
  /** Show as a full-screen modal (used by globe switcher) */
  asModal?: boolean;
  /** Called after a language is picked */
  onPicked?: (code: string) => void;
};

export function LanguagePicker({ asModal, onPicked }: Props) {
  const { lang, setLang, t } = useLanguage();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return LOCALES;
    return LOCALES.filter(
      (l) =>
        l.name.toLowerCase().includes(needle) ||
        l.native.toLowerCase().includes(needle) ||
        l.code.toLowerCase().includes(needle),
    );
  }, [q]);

  const pick = (code: string) => {
    setLang(code);
    onPicked?.(code);
  };

  const inner = (
    <div className={asModal ? "w-full max-w-[520px] rounded-2xl border border-border bg-surface p-5 shadow-2xl" : "w-full max-w-[520px]"}>
      <div className="mb-4 text-center">
        <div className="text-2xl">🌐</div>
        <h1 className="mt-2 text-lg font-medium text-text-1">{t("Choose your language")}</h1>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("Search languages…")}
        className="auth-input mb-3"
      />
      <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pe-1 sm:grid-cols-3">
        {filtered.map((l) => {
          const active = l.code === lang;
          return (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              className={`rounded-xl border px-3 py-2.5 text-start transition hover:-translate-y-0.5 hover:bg-surface-2 ${
                active ? "border-primary bg-surface-2" : "border-border bg-surface"
              }`}
            >
              <span className="block text-[14px] font-medium text-text-1" dir={l.rtl ? "rtl" : "ltr"}>
                {l.native}
              </span>
              <span className="block text-[11px] text-text-3">{l.name}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-text-3">—</p>
        )}
      </div>
    </div>
  );

  if (!asModal) return inner;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-8">
      {inner}
    </div>
  );
}
