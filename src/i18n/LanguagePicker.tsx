import { useLanguage } from "./LanguageContext";

type Props = {
  asModal?: boolean;
  onPicked?: (code: "en" | "ar") => void;
};

export function LanguagePicker({ asModal, onPicked }: Props) {
  const { lang, setLang, t } = useLanguage();

  const pick = (code: "en" | "ar") => {
    setLang(code);
    onPicked?.(code);
  };

  const opt = (code: "en" | "ar", native: string, name: string) => {
    const active = lang === code;
    return (
      <button
        key={code}
        onClick={() => pick(code)}
        className={`rounded-xl border px-5 py-4 text-start transition hover:-translate-y-0.5 hover:bg-surface-2 ${
          active ? "border-primary bg-surface-2" : "border-border bg-surface"
        }`}
      >
        <span className="block text-[16px] font-medium text-text-1" dir={code === "ar" ? "rtl" : "ltr"}>
          {native}
        </span>
        <span className="block text-[11px] text-text-3">{name}</span>
      </button>
    );
  };

  const inner = (
    <div className={asModal ? "w-full max-w-[420px] rounded-2xl border border-border bg-surface p-5 shadow-2xl" : "w-full max-w-[420px]"}>
      <div className="mb-5 text-center">
        <div className="text-2xl">🌐</div>
        <h1 className="mt-2 text-lg font-medium text-text-1">{t("Choose your language")}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {opt("en", "English", "English")}
        {opt("ar", "العربية", "Arabic")}
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
