import { asEta, etaText } from "@/lib/eta";

/** How long delivery takes, as a small pill beside the place it applies to.
 *
 *  The same shape the product sheet puts on a country and on a city, so an
 *  order card and a listing say it the same way. Renders nothing when the shop
 *  never gave a time, which is what "no badge" means everywhere else.
 *
 *  Deliberately not a row of its own. A duration is an adjective on a place,
 *  and on an order card the place is already written down — putting the time
 *  beside it is the whole of the information, where a separate line has to
 *  name the place again before it means anything. */
export function EtaBadge({ eta, ar, className = "" }: { eta: unknown; ar: boolean; className?: string }) {
  const e = asEta(eta);
  if (!e) return null;
  return (
    <span className={"eta-badge " + className} data-no-i18n>
      {etaText(e, ar)}
    </span>
  );
}
