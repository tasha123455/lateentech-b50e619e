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
  /* The box, the text and the toggle are one thing.
     They used to be siblings: the caller's className painted a bordered box
     around the text only, and the button landed underneath it — outside the
     border, and out of line with it wherever the box carried a margin of its
     own. Wrapping them means the toggle sits inside whatever the description
     is drawn as, which is how the business card has always read. */
  return (
    <div className={className} style={style}>
      <div
        ref={ref}
        data-no-i18n
        style={
          open
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
        }
      >
        {text}
      </div>
      {over && (
        /* The click stops here. Every card this sits in toggles when its body
           is tapped, so without this, opening the description shut the card
           around it — the two handlers fired on the same tap and the outer one
           won. */
        <button
          type="button"
          className="pd-desc-more"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {open ? (ar ? "أقل" : "less") : ar ? "المزيد..." : "more..."}
        </button>
      )}
    </div>
  );
}
