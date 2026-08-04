/* Where the cover photo is looking.
 *
 * A business owner drags their cover photo around when listing a product, and
 * what they are choosing is which part of it survives being cropped to a
 * square. That choice was being honoured in exactly one place — the marketer's
 * browse grid — so the same product showed the owner's framing there and the
 * middle of the photo everywhere else: on the order card, in the notification,
 * on the public link.
 *
 * The value is one pair per product and it belongs to the *cover*, which is
 * photos[0]. A gallery showing the second and third photos must not apply it:
 * the owner never framed those, and moving them would crop something they
 * never looked at.
 *
 * 50/50 is dead centre, which is both the database default and what an
 * un-dragged photo means, so a product that was never framed renders exactly
 * as it always did. */

const CENTRE = 50;

const pct = (v: unknown): number => {
  const n = Number(v);
  // Clamped rather than trusted: this goes straight into a style, and a value
  // from an older row or a hand-written API call has no reason to be sane.
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : CENTRE;
};

/** `object-position` for a cover photo, given the owner's framing. */
export function coverPosition(x: unknown, y: unknown): string {
  return `${pct(x)}% ${pct(y)}%`;
}

/** The style a cover <img> needs: cropped to its box, framed where the owner
 *  left it. Spread over whatever else the call site is already setting. */
export function coverStyle(x: unknown, y: unknown): {
  objectFit: "cover";
  objectPosition: string;
} {
  return { objectFit: "cover", objectPosition: coverPosition(x, y) };
}
