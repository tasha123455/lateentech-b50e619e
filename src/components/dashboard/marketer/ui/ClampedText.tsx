import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { isAr } from "../lib/format";

/** Text cut to `lines` lines, with the rest behind a "more…" toggle.
 *
 *  The toggle only appears when the text really is longer than the space, and
 *  that is measured rather than guessed: a line is however much fits at the
 *  reader's width and font size, so counting characters gets it wrong on one
 *  device or the other, and a "more…" that opens nothing is worse than no
 *  "more…" at all.
 *
 *  Measurement happens while the text is still clamped. Once it is open,
 *  scrollHeight and clientHeight agree and the question stops being askable,
 *  so the answer from the clamped state is the one that is kept. */
export function ClampedText({
  text, lines = 3, className, style,
}: {
  text: string;
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  useLayoutEffect(() => {
    if (open) return;
    const el = ref.current;
    if (!el) return;
    const check = () => setOver(el.scrollHeight - el.clientHeight > 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines, open]);

  // A font arriving after first paint changes what fits, so ask again once it has.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (!fonts?.ready) return;
    let live = true;
    void fonts.ready.then(() => {
      const el = ref.current;
      if (live && el && !open) setOver(el.scrollHeight - el.clientHeight > 1);
    });
    return () => { live = false; };
  }, [open]);

  const ar = isAr();
  return (
    <>
      <div
        ref={ref}
        className={className}
        data-no-i18n
        style={{
          ...style,
          ...(open
            ? null
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }),
        }}
      >
        {text}
      </div>
      {over && (
        <button type="button" className="pd-desc-more" onClick={() => setOpen((v) => !v)}>
          {open ? (ar ? "أقل" : "less") : ar ? "المزيد..." : "more..."}
        </button>
      )}
    </>
  );
}
