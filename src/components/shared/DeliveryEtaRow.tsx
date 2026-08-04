import { useState } from "react";

import { asEta, etaLabel, etaText, type Eta } from "@/lib/eta";

/** How long delivery takes for one order's city, folded away.
 *
 *  It is one line and it is optional, so it opens on a tap rather than sitting
 *  in a card that already has a dozen rows. Closed it still says the answer —
 *  hiding the figure behind a chevron would make the reader work for the one
 *  thing they came for — and open it says where the figure came from, which is
 *  the part that is only sometimes interesting.
 *
 *  A city may narrow its country's time. Where it has not, the country's
 *  stands, and saying so is the difference between "this city is 2 days" and
 *  "everywhere in Libya is 2 days". */
export function DeliveryEtaRow({
  cityEta, zoneEta, city, ar, className = "",
}: {
  cityEta: unknown;
  zoneEta: unknown;
  /** Shown when the figure is the city's own rather than the country's.
   *  Pass it already localised — the shared component cannot know which
   *  dashboard's city list to look it up in. */
  city?: string;
  ar: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const c: Eta | null = asEta(cityEta);
  const z: Eta | null = asEta(zoneEta);
  const shown = c || z;
  if (!shown) return null;

  /* <bdi> around the name because a city with no Arabic spelling stays in
     Latin script, and a Latin run at the end of an Arabic line is what turns
     "خاص بـTripoli" into something read back to front. */
  const from = c ? (
    ar
      ? <>{"خاص بـ"}<bdi>{city || "هذه المدينة"}</bdi></>
      : <>{"for "}<bdi>{city || "this city"}</bdi></>
  ) : (
    ar ? "لكل الدولة" : "country-wide"
  );

  return (
    <div className={"eta-row " + className} data-no-i18n>
      <button type="button" className="eta-row-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="eta-row-lbl">{etaLabel(ar)}</span>
        <span className="eta-row-val">{etaText(shown, ar)}</span>
        <span className={"eta-row-chev" + (open ? " open" : "")}>▾</span>
      </button>
      {open && (
        <div className="eta-row-body">
          <div>{from}</div>
          {/* Both, when the city narrows the country — the comparison is the
              reason the city's figure was worth typing. */}
          {!!c && !!z && (
            <div className="eta-row-sub">
              {(ar ? "الدولة: " : "Country: ") + etaText(z, ar)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
