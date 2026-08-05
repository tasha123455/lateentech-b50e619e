/* How long delivery takes, as a range of whole days.
 *
 * A shop gives one figure ("3 days") or two ("2 to 4 days"). The country's
 * figure is required — a marketer promising a customer a delivery cannot be
 * left guessing — and a city may narrow it, which is optional: most shops ship
 * everywhere on the same schedule and should not be made to type it fourteen
 * times.
 *
 * One module because the same range is written by the business form, stored in
 * the delivery JSON, and then read by five different screens. Formatting it in
 * five places is how "2–4 days" becomes "2 - 4 days" on one of them. */

export type Eta = { min: number; max: number | null };

/** Reads whatever the database or a form field holds. Returns null when there
 *  is no usable figure, which is what "the shop left it blank" looks like. */
export function asEta(v: unknown): Eta | null {
  const o = v as { min?: unknown; max?: unknown } | null | undefined;
  if (!o || typeof o !== "object") return null;
  const min = Number(o.min);
  if (!Number.isFinite(min) || min < 0) return null;
  const maxRaw = Number(o.max);
  const max = Number.isFinite(maxRaw) && maxRaw > min ? maxRaw : null;
  return { min: Math.round(min), max: max == null ? null : Math.round(max) };
}

/** "2–4 days" / "يومين - 4 أيام".
 *
 *  Arabic counts one and two differently from everything above them, so a
 *  number cannot simply be dropped in front of a plural: "1 أيام" and "2 أيام"
 *  are both wrong. The single-figure case is spelled out; a range keeps its
 *  digits and only inflects the word at the end. */
export function etaText(e: Eta | null, ar: boolean): string {
  if (!e) return "";
  if (!ar) {
    if (e.max == null) return `${e.min} ${e.min === 1 ? "day" : "days"}`;
    return `${e.min}–${e.max} days`;
  }
  const one = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : `${n} أيام`);
  if (e.max == null) return one(e.min);
  return `${e.min} - ${one(e.max)}`;
}

/** The same, straight from a stored value. */
export const etaTextOf = (v: unknown, ar: boolean): string => etaText(asEta(v), ar);

/** The label these ranges sit behind, in either language. */
export const etaLabel = (ar: boolean): string => (ar ? "مدة التوصيل" : "Delivery time");
