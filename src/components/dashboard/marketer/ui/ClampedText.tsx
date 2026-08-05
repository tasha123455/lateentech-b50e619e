import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { isAr } from "../lib/format";

/** The dots that stand in for the rest of the text. Five rather than the
 *  single "…" a CSS clamp draws: at this size one ellipsis character barely
 *  registers, and being noticed is the whole job. */
const DOTS = ".....";

/** Text cut to `lines` lines, ending "..... more" on the last one.
 *
 *  Where the cut falls is measured, not counted. A line is however much fits
 *  at the reader's width and font size, so a character count is wrong on one
 *  device or the other — and the sum has to include the dots and the word
 *  after them, because those share the last line with the text they follow.
 *
 *  Measuring happens on a copy parked off-screen, never on the element React
 *  is rendering. A binary search over the length means writing text into the
 *  DOM a dozen times, and anything left behind in React's own tree would
 *  survive until the next render.
 *
 *  CSS could do the clamping alone, but not with a control on the last line:
 *  -webkit-line-clamp draws its own ellipsis and leaves nothing to sit beside,
 *  and floating a button into the corner covers whatever text is under it. */
export function ClampedText({
  text, lines = 3, className, style, moreClassName = "pd-desc-more",
}: {
  text: string;
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
  /** The toggle's class. Defaults to the dashboards' own, which is styled in
   *  their stylesheets; the public product page loads none of those and passes
   *  its own instead. */
  moreClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Characters that survive the cut, or null while the whole text fits. */
  const [cut, setCut] = useState<number | null>(null);
  /** Stops the trim below from running away if it can never satisfy itself. */
  const trims = useRef(0);

  const ar = isAr();
  const moreLabel = ar ? "المزيد" : "more";
  const lessLabel = ar ? "أقل" : "less";

  useLayoutEffect(() => {
    if (open) return;
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (!width || typeof getComputedStyle !== "function") return;
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
      if (!lh) return;
      // A hair over, so a line landing exactly on the boundary still counts.
      const maxH = lh * lines + 1;

      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText =
        `position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;width:${width}px;`;
      // Everything that decides where a line breaks, taken from the real one.
      [
        "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
        "word-spacing", "line-height", "white-space", "word-break", "overflow-wrap",
        "text-transform", "direction", "text-indent",
      ].forEach((prop) => probe.style.setProperty(prop, cs.getPropertyValue(prop)));
      document.body.appendChild(probe);

      const fits = (s: string) => {
        probe.textContent = s;
        return probe.scrollHeight <= maxH;
      };

      if (fits(text)) {
        probe.remove();
        setCut(null);
        return;
      }

      /* The dots and the word after them land on the last line, so the search
         weighs the text against what will follow it rather than against the
         text alone. Without that the toggle wraps onto a fourth line, which is
         the thing this exists to avoid. */
      const tail = DOTS + " " + moreLabel;
      let lo = 0;
      let hi = text.length;
      let best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (fits(text.slice(0, mid).trimEnd() + tail)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      probe.remove();
      trims.current = 0;
      setCut(best);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines, open, moreLabel]);

  /* The probe weighs the toggle as plain text, but the real one is bolder and
     carries a margin, so the guess can run a line long — it did in Arabic,
     where the words are wide enough for the difference to matter. This trims
     against the rendered element itself, which includes the real button, so
     the answer stops being an estimate. It runs at most a step or two, because
     the guess is already close. */
  useLayoutEffect(() => {
    if (open || cut == null) return;
    const el = ref.current;
    if (!el || typeof getComputedStyle !== "function") return;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    if (!lh || el.scrollHeight <= lh * lines + 1) return;
    if (trims.current >= 40 || cut <= 0) return;
    trims.current += 1;
    setCut((c) => Math.max(0, (c ?? 0) - Math.max(1, Math.round(text.length * 0.01))));
  }, [cut, open, lines, text]);

  // A font arriving after first paint changes what fits, so ask again once it
  // has. Nudging the box is enough: the observer above re-measures on resize,
  // and a font swap resizes it.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (!fonts?.ready) return;
    let live = true;
    void fonts.ready.then(() => {
      if (live) setCut((c) => c);
    });
    return () => { live = false; };
  }, [open]);

  const clipped = !open && cut != null;
  const shown = clipped ? text.slice(0, cut).trimEnd() : text;

  /* Collapsing gives the page back the height the text was using, and it used
     to give it back in a single frame. Read to the end of a long description
     and you are at the bottom of the page, so the document getting shorter
     under you leaves the scroll position past the new bottom and the browser
     drags the whole page up to meet it — measured at 54px on a phone, all in
     one frame, which is the lurch.

     It cannot be avoided: the page really is shorter, and the reader really is
     at the bottom. What can be avoided is its happening all at once. Handing
     the height back over a fifth of a second means the page slides instead of
     jumping, and the movement reads as the consequence of the tap rather than
     as something going wrong.

     Height is animated from the outside in JS because both ends are content —
     three lines of text versus ten — and CSS cannot transition between two
     heights it has never been told. */
  const boxRef = useRef<HTMLDivElement>(null);
  const fromH = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const from = fromH.current;
    fromH.current = null;
    if (!el || from == null) return;
    const to = el.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    el.style.overflow = "hidden";
    el.style.height = from + "px";
    void el.offsetHeight; // commit the start height before the transition
    el.style.transition = "height .2s cubic-bezier(.4,0,.2,1)";
    el.style.height = to + "px";

    let done = false;
    const clear = () => {
      if (done) return;
      done = true;
      el.style.height = "";
      el.style.overflow = "";
      el.style.transition = "";
    };
    el.addEventListener("transitionend", clear, { once: true });
    // A transition that never fires — an interrupted one, a hidden card —
    // must not leave the box pinned to a fixed height for ever.
    const bail = setTimeout(clear, 400);
    return () => { clearTimeout(bail); clear(); };
  }, [open]);

  /* The box, the text and the toggle are one thing.
     They used to be siblings: the caller's className painted a bordered box
     around the text only, and the button landed underneath it — outside the
     border, and out of line with it wherever the box carried a margin of its
     own. Wrapping them means the toggle sits inside whatever the description
     is drawn as, which is how the business card has always read. */
  return (
    <div className={className} style={style} ref={boxRef}>
      {/* One element, so the dots and the toggle carry straight on from the
          last word rather than starting a line of their own. */}
      <div ref={ref} data-no-i18n>
        {shown}
        {clipped && DOTS}
        {(clipped || open) && (
          /* The click stops here. Every card this sits in toggles when its
             body is tapped, so without this, opening the description shut the
             card around it — the two handlers fired on the same tap and the
             outer one won. */
          <button
            type="button"
            className={moreClassName}
            onClick={(e) => {
              e.stopPropagation();
              // Measured before the text changes; the effect above animates
              // from here to whatever the new text needs.
              fromH.current = boxRef.current?.getBoundingClientRect().height ?? null;
              setOpen((v) => !v);
            }}
          >
            {open ? lessLabel : moreLabel}
          </button>
        )}
      </div>
    </div>
  );
}
