import { useEffect, useMemo, useRef, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

import { LIBYA_CITIES } from "@/components/dashboard/marketer/lib/constants";
import { searchMatcher, useLangTick } from "@/components/dashboard/marketer/lib/format";
import { useLanguage } from "@/i18n/LanguageContext";

/** The city's name in the language being read. Stored values are always the
 *  English name, so this only affects what is shown. */
function cityName(en: string, ar: boolean): string {
  if (!en) return "";
  const m = LIBYA_CITIES.find((c) => c.en === en || c.ar === en);
  if (!m) return en;
  return ar ? m.ar : m.en;
}

/**
 * Picks one Libyan city, from the one list the delivery zones use.
 *
 * A hundred and sixty towns is too many to scroll past, so the sheet leads
 * with the search box and matches on both spellings at once — typing "bengazi"
 * or "بنغاز" both land on Benghazi, the same typo-tolerant rule every other
 * search bar in the app follows.
 *
 * The closed control borrows the field class of whatever page it lands on, so
 * it sits among its neighbours rather than approximating them; the sheet it
 * opens carries its own colours, because a modal over the whole screen looks
 * the same wherever it was opened from.
 */
export function CityPicker({
  value,
  onChange,
  disabled = false,
  id,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (city: string) => void;
  disabled?: boolean;
  id?: string;
  /** What a screen reader should call this. A button is not a form control, so
   *  the field's title cannot be attached to it the way a label is attached to
   *  an input; without this it is announced as the words on its face, which
   *  before a city is chosen are "Select city". */
  ariaLabel?: string;
  /** The field class of the page it sits on — `auth-input` on the register
   *  form, `pd-inp` in a dashboard sheet — so it matches its neighbours
   *  instead of approximating them. */
  className?: string;
}) {
  useLangTick();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  /* From the route, not from <html dir>. The server has no document to read,
     so asking the page which language it is gets "English" there and "Arabic"
     in the browser a moment later — and React, finding the two versions of the
     Arabic registration page disagree about the word in this control, throws
     the whole form away and builds it again. That rebuild is what erases a
     name typed in the first half second. The route knows the language on both
     sides, so both sides now write the same word. */
  const ar = useLanguage().lang === "ar";

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setQ("");
    // Focus late enough that the panel exists; a phone opening its keyboard on
    // a field that is still animating in ends up scrolled somewhere strange.
    const h = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(h);
    };
  }, [open]);

  const matches = useMemo(() => {
    const hit = searchMatcher(q);
    return LIBYA_CITIES.filter((c) => hit(c.en) || hit(c.ar));
  }, [q]);

  const label = value ? cityName(value, ar) : ar ? "اختر المدينة" : "Select city";

  return (
    <>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-no-i18n
        className={className}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", textAlign: ar ? "right" : "left",
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
          // Only when no field class was given, so the control is still legible
          // somewhere it has not been dressed for.
          ...(className ? null : {
            minHeight: 44, padding: "0 12px", borderRadius: 12,
            border: "1px solid var(--color-border, #3a3a3a)",
            background: "var(--color-background, #0f0f0f)",
            fontSize: 13.5, fontFamily: "inherit",
          }),
          ...(value ? null : { color: "var(--color-text-3, #7e7b77)" }),
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          dir={ar ? "rtl" : "ltr"}
          style={{
            position: "fixed", inset: 0, zIndex: 2147482000, display: "flex",
            alignItems: "center", justifyContent: "center", padding: 16,
            fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
          }}
        >
          <div className="wasla-scrim" onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0 }} />
          <div
            style={{
              position: "relative", zIndex: 1, width: "100%", maxWidth: 380, maxHeight: "78vh",
              display: "flex", flexDirection: "column", background: "#1a1a1a", borderRadius: 18,
              border: "0.5px solid #333330", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.55)",
            }}
          >
            <div style={{ padding: 14, borderBottom: "0.5px solid #2a2a2a" }}>
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ar ? "ابحث عن مدينة…" : "Search a city…"}
                data-no-i18n
                style={{
                  width: "100%", height: 42, padding: "0 12px", borderRadius: 11,
                  border: "1px solid #3a3a3a", background: "#0f0f0f", color: "#f0eeeb",
                  fontSize: 14, fontFamily: "inherit", outline: "none",
                }}
              />
            </div>

            <div style={{ overflowY: "auto", padding: 6, WebkitOverflowScrolling: "touch" }}>
              {matches.length ? (
                matches.map((c) => (
                  <button
                    key={c.en}
                    type="button"
                    data-no-i18n
                    onClick={() => { onChange(c.en); setOpen(false); }}
                    style={{
                      display: "block", width: "100%", padding: "11px 12px", borderRadius: 10,
                      border: "none", background: c.en === value ? "#252523" : "transparent",
                      color: c.en === value ? "#fff" : "#d9d6d2", fontSize: 14, fontFamily: "inherit",
                      textAlign: ar ? "right" : "left", cursor: "pointer",
                    }}
                  >
                    {ar ? c.ar : c.en}
                  </button>
                ))
              ) : (
                <div data-no-i18n style={{ padding: "22px 12px", textAlign: "center", color: "#7e7b77", fontSize: 13 }}>
                  {ar ? "ما في مدينة بهذا الاسم" : "No city by that name"}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              data-no-i18n
              style={{
                height: 46, border: "none", borderTop: "0.5px solid #2a2a2a", background: "transparent",
                color: "#9e9b97", fontSize: 14, fontFamily: "inherit", cursor: "pointer", flexShrink: 0,
              }}
            >
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
