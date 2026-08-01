import { useEffect, useRef, useState } from "react";

/** Closes a little popup when the tap lands anywhere else. */
export function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

export function SoonBadge({ sheet }: { sheet?: boolean }) {
  if (sheet) return <span className="cpk-soon">Soon</span>;
  return (
    <span className="ms-2 inline-block rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
      Soon
    </span>
  );
}

/* Libya is the only country the platform runs in, so the list is one real
   entry and a promise. It stays a dropdown rather than a label because it is
   the shape the second country will slot into, and because a phone number
   without a visible country code reads like a number missing its start.
 *
 * The code is wrapped in isolate marks so that "+218" keeps its plus on the
 * left inside an Arabic line. */
export const LIBYA_CC = "⁨+218⁩";

/* Two skins for one control.
 *
 * "auth" is the register form's, built from the app-level Tailwind tokens.
 * "sheet" is for the dashboards, whose sheets have their own palette — wearing
 * the auth skin in there put a lighter panel and a ▾ typed as a character next
 * to fields that use the dashboard's own borders and a drawn chevron, and the
 * seam showed. The behaviour is identical either way; only the classes differ. */
type Variant = "auth" | "sheet";

/** The chevron every picker in a dashboard sheet uses, so none of them is the
 *  one still drawing a ▾ typed as a character. */
export const PickerChevron = () => (
  <svg
    className="cpk-chev"
    width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** The country-code button beside a phone field. Shared with the admin's
 *  support screen, so somebody being helped sees the control they signed up
 *  with rather than a second thing that behaves almost like it. */
export function CountryCodePicker({
  variant = "auth",
  className,
  width = 82,
}: {
  variant?: Variant;
  className?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const sheet = variant === "sheet";
  const trigger = className ?? (sheet ? "cpk-btn" : "auth-input flex h-11 items-center gap-1 px-2 text-sm");

  return (
    <div ref={ref} className={sheet ? "cpk" : "relative shrink-0"} style={sheet ? { width } : undefined}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={trigger} style={sheet ? undefined : { width }}>
        <span>{LIBYA_CC}</span>
        {sheet ? <PickerChevron /> : <span className="text-text-3">▾</span>}
      </button>
      {open && (sheet ? (
        <div className="cpk-menu cpk-menu-wide">
          <div className="cpk-row">{LIBYA_CC} — <span>Libya</span></div>
          <div className="cpk-row cpk-row-soon"><span>More</span><SoonBadge sheet /></div>
        </div>
      ) : (
        <div className="absolute z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="cursor-default px-3 py-2 text-sm text-text-1 hover:bg-surface-2">
            {LIBYA_CC} — <span>Libya</span>
          </div>
          <div className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-text-3 opacity-70">
            <span>More</span>
            <SoonBadge />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The country field itself, as opposed to the dialling code beside the phone. */
export function CountryPicker({
  variant = "auth",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const sheet = variant === "sheet";
  const trigger = className ?? (sheet ? "cpk-btn cpk-btn-wide" : "auth-input flex w-full items-center justify-between text-start");

  return (
    <div ref={ref} className={sheet ? "cpk cpk-full" : "relative"}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={trigger}>
        <span className={sheet ? "cpk-val" : undefined}>🇱🇾 <span>Libya</span></span>
        {sheet ? <PickerChevron /> : <span className="text-text-3">▾</span>}
      </button>
      {open && (sheet ? (
        <div className="cpk-menu">
          <div className="cpk-row">🇱🇾 <span>Libya</span></div>
          <div className="cpk-row cpk-row-soon"><span>More countries</span><SoonBadge sheet /></div>
        </div>
      ) : (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="cursor-default px-3 py-2 text-sm text-text-1 hover:bg-surface-2">🇱🇾 <span>Libya</span></div>
          <div className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-text-3 opacity-70">
            <span>More countries</span>
            <SoonBadge />
          </div>
        </div>
      ))}
    </div>
  );
}
