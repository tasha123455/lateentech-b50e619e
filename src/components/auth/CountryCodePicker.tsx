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

export function SoonBadge() {
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

/** The country-code button beside a phone field. Lifted out of the register
 *  form so the admin's support screen offers the same control the person used
 *  when they signed up, rather than a second thing that behaves almost like
 *  it. `className` lets it wear the skin of whichever screen it is on. */
export function CountryCodePicker({
  className = "auth-input flex h-11 items-center gap-1 px-2 text-sm",
  width = 82,
}: {
  className?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className={className} style={{ width }}>
        <span>{LIBYA_CC}</span>
        <span className="text-text-3">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="cursor-default px-3 py-2 text-sm text-text-1 hover:bg-surface-2">
            {LIBYA_CC} — <span>Libya</span>
          </div>
          <div className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-text-3 opacity-70">
            <span>More</span>
            <SoonBadge />
          </div>
        </div>
      )}
    </div>
  );
}

/** The country field itself, as opposed to the dialling code beside the phone.
 *  Also lifted out of the register form so the admin's support screen offers
 *  the same control the person used when they signed up. */
export function CountryPicker({
  className = "auth-input flex w-full items-center justify-between text-start",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={className}>
        <span>🇱🇾 <span>Libya</span></span>
        <span className="text-text-3">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="cursor-default px-3 py-2 text-sm text-text-1 hover:bg-surface-2">🇱🇾 <span>Libya</span></div>
          <div className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-text-3 opacity-70">
            <span>More countries</span>
            <SoonBadge />
          </div>
        </div>
      )}
    </div>
  );
}
