import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LOCALES } from "@/i18n/locales";
import { useLang } from "@/i18n/LanguageContext";
import { LateenLogo } from "@/components/brand/LateenLogo";

export const Route = createFileRoute("/language")({
  head: () => ({
    meta: [{ title: "Choose your language — Lateen" }],
  }),
  component: LanguagePage,
});

function LanguagePage() {
  const { lang, setLang, t, ready } = useLang();
  const nav = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => { if (ready && !pending) setPending(lang); }, [ready, lang, pending]);

  const selected = pending ?? lang;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOCALES;
    return LOCALES.filter(
      (l) => l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q),
    );
  }, [query]);

  const onContinue = () => {
    setLang(selected);
    nav({ to: "/" });
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-5 py-10">
      <LateenLogo size={48} />
      <h1 className="mt-4 font-serif text-2xl font-medium text-text-1">{t("Choose your language")}</h1>
      <p className="mt-1 text-[12px] text-text-2">{t("You can change this anytime from the menu")}</p>

      <div className="mt-6 w-full max-w-[420px]">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search languages")}
          className="auth-input"
          aria-label={t("Search languages")}
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          {filtered.map((l) => {
            const isSel = l.code === selected;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => setPending(l.code)}
                className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition ${
                  isSel
                    ? "border-marketer bg-marketer-tint text-marketer-foreground"
                    : "border-border bg-surface text-text-1 hover:bg-surface-2"
                }`}
                aria-pressed={isSel}
                lang={l.code}
                dir={l.rtl ? "rtl" : "ltr"}
              >
                <span className="text-[15px] font-medium">{l.native}</span>
                <span className="mt-0.5 text-[11px] text-text-2">{l.name}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-6 h-11 w-full rounded-xl bg-marketer text-sm font-medium text-white transition hover:opacity-90"
        >
          {t("Continue")}
        </button>
      </div>
    </main>
  );
}
