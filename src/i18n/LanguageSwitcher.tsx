import { useLanguage } from "./LanguageContext";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  const next = lang === "ar" ? "en" : "ar";
  const label = lang === "ar" ? "EN" : "ع";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title="Language / اللغة"
      aria-label="Toggle language"
      data-i18n-skip
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-2 hover:bg-surface-2 ${className}`}
    >
      <span aria-hidden>🌐</span>
      <span className="font-medium text-text-1">{label}</span>
    </button>
  );
}
