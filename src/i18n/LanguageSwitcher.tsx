import { useLanguage } from "./LanguageContext";
import { LanguagePicker } from "./LanguagePicker";
import { LOCALES } from "./locales";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, open, isOpen, close } = useLanguage();
  const current = LOCALES.find((l) => l.code === lang);
  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Language"
        aria-label="Change language"
        data-i18n-skip
        className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-2 hover:bg-surface-2 ${className}`}
      >
        <span aria-hidden>🌐</span>
        <span className="font-medium text-text-1">{current?.code.toUpperCase() ?? "EN"}</span>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[99] bg-black/60" onClick={close} />
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8 pointer-events-none">
            <div className="pointer-events-auto">
              <LanguagePicker asModal onPicked={close} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
