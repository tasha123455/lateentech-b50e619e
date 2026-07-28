// Single shared implementation of the one-time "Choose your language" screen.
// Used by the root route ("/") and by public product share links (/en|ar/p/:id).

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { detectLang, isLang, rememberLang, storedLang, withLang, type Lang } from "@/i18n/langPath";

export function LanguageChooser({
  suffix = "",
  redirectWhenStored = true,
  onPicked,
}: {
  /** Logical path to land on after picking, e.g. "/p/abc". */
  suffix?: string;
  /** When true, an already-stored preference navigates straight through. */
  redirectWhenStored?: boolean;
  onPicked?: (lang: Lang) => void;
}) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(!redirectWhenStored);

  useEffect(() => {
    if (!redirectWhenStored) return;
    const stored = storedLang();
    if (isLang(stored)) {
      navigate({ to: withLang(stored, suffix), replace: true });
      return;
    }
    setReady(true);
  }, [navigate, redirectWhenStored, suffix]);

  const pick = (lang: Lang) => {
    rememberLang(lang);
    onPicked?.(lang);
    navigate({ to: withLang(lang, suffix), replace: true });
  };

  if (!ready) {
    return <div className="flex min-h-dvh items-center justify-center bg-background" />;
  }

  const guess = detectLang();

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-background px-6 py-10"
      dir="ltr"
    >
      <div className="mb-10">
        <LateenLogo variant="mark" size={96} glow />
      </div>
      <h1 className="mb-2 text-center text-2xl font-semibold text-foreground">
        Choose your language
      </h1>
      <p className="mb-8 text-center text-sm text-muted-foreground" dir="rtl">
        اختر لغتك
      </p>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <button
          type="button"
          onClick={() => pick("en")}
          className="w-full rounded-xl border border-border bg-surface px-5 py-4 text-base font-medium text-foreground transition hover:bg-accent"
          autoFocus={guess === "en"}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => pick("ar")}
          className="w-full rounded-xl border border-border bg-surface px-5 py-4 text-base font-medium text-foreground transition hover:bg-accent"
          autoFocus={guess === "ar"}
          dir="rtl"
        >
          العربية
        </button>
      </div>
    </div>
  );
}
