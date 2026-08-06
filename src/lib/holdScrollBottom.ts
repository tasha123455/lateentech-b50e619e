/* Keeping the page still while something on it gets shorter.
 *
 * Read to the end of a long product description and you are at the bottom of
 * the page. Collapse it and the document loses that height, which leaves the
 * scroll position past the new bottom — so the browser drags the scroll up to
 * meet it, and everything above the description slides down the screen. The
 * description was the only thing that changed; the whole page appears to move.
 *
 * Animating the collapse spreads that over a fifth of a second, which is
 * better than one frame but is still the page moving when nothing above it
 * did. The movement exists only because the document got shorter, so the fix
 * is to not let it: pad the bottom by what is about to be lost, before losing
 * it. The scroll position stays valid, nothing is clamped, and nothing above
 * the description moves at all.
 *
 * The padding is temporary, and it releases itself. Nobody owns it and nobody
 * has to remember to give it back: it is trimmed on every scroll to exactly
 * the amount the scroll position is still standing on, so it melts away as the
 * reader moves back up the page and is gone the moment it stops holding
 * anything. Trimming can therefore never move the page either — it only ever
 * lets go of room nothing is resting on.
 */

type Held = {
  /** The bottom padding the element had before we touched it. */
  inline: string;
  base: number;
  /** How much we have added. */
  px: number;
  top: () => number;
  view: () => number;
  full: () => number;
  target: EventTarget;
};

const held = new Map<HTMLElement, Held>();
/** One listener per scroller, however many collapses are leaning on it. */
const watching = new Map<HTMLElement, () => void>();

/** Whatever actually scrolls around `node` — the window on a dashboard page,
 *  the sheet's own body when the text is inside an overlay. */
function scrollerOf(node: HTMLElement): Omit<Held, "inline" | "base" | "px"> & { pad: HTMLElement } {
  for (let p = node.parentElement; p; p = p.parentElement) {
    const el = p;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) {
      return {
        pad: el,
        top: () => el.scrollTop,
        view: () => el.clientHeight,
        full: () => el.scrollHeight,
        target: el,
      };
    }
  }
  const de = document.documentElement;
  return {
    pad: document.body,
    top: () => window.scrollY || de.scrollTop || 0,
    view: () => de.clientHeight,
    full: () => de.scrollHeight,
    target: window,
  };
}

function apply(el: HTMLElement, rec: Held, px: number): void {
  rec.px = px;
  if (px <= 0) {
    el.style.paddingBottom = rec.inline;
    held.delete(el);
    const stop = watching.get(el);
    if (stop) { stop(); watching.delete(el); }
    return;
  }
  el.style.paddingBottom = rec.base + px + "px";
}

/** Drop whatever slack the scroll position is no longer standing on.
 *
 *  `full() - px` is what the scrollable area would measure without our
 *  padding, so anything the scroll offset does not need is free to go. */
function trim(el: HTMLElement): void {
  const rec = held.get(el);
  if (!rec) return;
  const need = Math.ceil(rec.top() - (rec.full() - rec.px - rec.view()));
  apply(el, rec, Math.min(rec.px, Math.max(0, need)));
}

/** Trim every scroller we are padding. Called when a collapse has finished
 *  settling, and again whenever the page grows enough to make the room
 *  unnecessary — expanding the same text, for one. */
export function releaseHeldBottom(): void {
  for (const el of Array.from(held.keys())) trim(el);
}

/** Take up `slack` pixels of room at the bottom before something loses it.
 *
 *  Call before the change; call `releaseHeldBottom()` after it has finished —
 *  after any animation, not merely after the render, because a box that is
 *  still shrinking has not given its height back yet.
 *
 *  Growing the scrollable area never moves anything, so the room taken is
 *  deliberately generous: the full height of what might disappear, rather than
 *  a guess at how much of it will. */
export function holdBottom(node: HTMLElement, slack: number): void {
  if (typeof window === "undefined" || !Number.isFinite(slack) || slack <= 0) return;
  const s = scrollerOf(node);
  const el = s.pad;

  let rec = held.get(el);
  if (!rec) {
    rec = {
      inline: el.style.paddingBottom,
      base: parseFloat(getComputedStyle(el).paddingBottom) || 0,
      px: 0,
      top: s.top, view: s.view, full: s.full, target: s.target,
    };
    held.set(el, rec);
  }
  apply(el, rec, rec.px + Math.ceil(slack));

  if (!watching.has(el)) {
    const onScroll = () => trim(el);
    s.target.addEventListener("scroll", onScroll, { passive: true });
    watching.set(el, () => s.target.removeEventListener("scroll", onScroll));
  }
}

/** Holds a scroll position across a change, whatever tries to move it.
 *
 *  holdBottom above answers the one reason the page is *known* to move when a
 *  block shrinks: the scroll offset ending up past the new bottom. It cannot
 *  answer the others. A collapse is a layout change in the middle of a live
 *  page, and layout changes are exactly when a browser second-guesses where
 *  the reader should be — scroll anchoring picking a new anchor and correcting
 *  to it, a focused control being brought into view, a restoration pass firing
 *  on a re-render. Each is a different mechanism with the same symptom, and
 *  none of them is the component's to negotiate with.
 *
 *  So this states the requirement instead of arguing about the cause: for a
 *  short window after the tap, the offset is what it was. Anything that moves
 *  it is put back on the next frame.
 *
 *  It yields immediately to the reader. The first touch, wheel or key ends the
 *  window, because past that point moving the page is what they asked for, and
 *  a guard that outlives its reason is a bug of its own. It also never asks for
 *  an offset that no longer exists: a genuinely shorter page is clamped to its
 *  own end rather than fought frame after frame.
 *
 *  Bounded in time, cancelled by intent, and correct if it never fires. */
export function pinScroll(node: HTMLElement, ms = 500): () => void {
  if (typeof window === "undefined") return () => {};
  const s = scrollerOf(node);
  const start = s.top();
  let alive = true;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout>;

  const stop = () => {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    for (const ev of GIVE_UP) window.removeEventListener(ev, stop, true);
  };

  const tick = () => {
    if (!alive) return;
    const want = Math.max(0, Math.min(start, s.full() - s.view()));
    if (Math.abs(s.top() - want) > 1) {
      if (s.target === window) window.scrollTo(0, want);
      else (s.pad as HTMLElement).scrollTop = want;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  timer = setTimeout(stop, ms);
  for (const ev of GIVE_UP) window.addEventListener(ev, stop, true);
  return stop;
}

const GIVE_UP = ["touchstart", "wheel", "keydown", "pointerdown"] as const;
