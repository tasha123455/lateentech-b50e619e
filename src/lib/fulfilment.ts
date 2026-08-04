/* How a product is fulfilled — reserved, or handed over on the spot.
 *
 * The business owner picks one when listing the product, and the answer is
 * shown to marketers and admins in six different places: the business's own
 * product card, the marketer's order card, both browse grids, notifications,
 * and the business order card. One definition here so those six cannot drift
 * apart, and so adding a seventh is a one-liner. */

export type Fulfilment = "reserve" | "instant";

export const FULFILMENTS: Fulfilment[] = ["reserve", "instant"];

const LABELS: Record<Fulfilment, { en: string; ar: string }> = {
  // "حجز" is the word the owner uses for it; "Reserve" is the English the
  // request asked for.
  reserve: { en: "Reserve", ar: "حجز" },
  instant: { en: "Instant delivery", ar: "تسليم فوري" },
};

/** A short line saying what the choice means, for the listing form. */
const HINTS: Record<Fulfilment, { en: string; ar: string }> = {
  reserve: {
    en: "The customer reserves it and waits for it to be prepared.",
    ar: "الزبون يحجز المنتج وينتظر تجهيزه.",
  },
  instant: {
    en: "Ready now — it goes out as soon as the order is confirmed.",
    ar: "متوفر حالاً — يُرسل فور تأكيد الطلب.",
  },
};

/** Narrows whatever came back from the database. NULL means the product
 *  predates the choice and must show no badge at all, rather than being
 *  guessed into one. */
export function asFulfilment(v: unknown): Fulfilment | null {
  return v === "reserve" || v === "instant" ? v : null;
}

export function fulfilmentLabel(v: unknown, ar: boolean): string {
  const f = asFulfilment(v);
  return f ? (ar ? LABELS[f].ar : LABELS[f].en) : "";
}

export function fulfilmentHint(f: Fulfilment, ar: boolean): string {
  return ar ? HINTS[f].ar : HINTS[f].en;
}

/** Reserve reads as "wait", instant reads as "now", so they are coloured the
 *  way the rest of the app already colours those two ideas. */
export function fulfilmentColour(f: Fulfilment): { fg: string; bg: string; border: string } {
  return f === "instant"
    ? { fg: "#34c77b", bg: "rgba(52,199,123,0.12)", border: "rgba(52,199,123,0.35)" }
    : { fg: "#e0b062", bg: "rgba(224,176,98,0.12)", border: "rgba(224,176,98,0.35)" };
}
