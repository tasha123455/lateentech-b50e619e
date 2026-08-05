import { useState } from "react";

import { etaText } from "@/lib/eta";
import { freeLbl, isAr } from "../lib/format";
import { cityLabel, countryName } from "../lib/mappers";
import type { Zone } from "../lib/types";
import { Money } from "../ui/Money";
import { pdT } from "./pdText";

const Chevron = ({ open, size = 14 }: { open?: boolean; size?: number }) => (
  <svg
    className="pd-chev"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={open ? { transform: "rotate(180deg)" } : undefined}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const FreeOr = ({ n, sym, code }: { n: number; sym: string; code: string }) =>
  Number(n || 0) === 0 ? <b style={{ color: "#34c77b" }}>{freeLbl()}</b> : <Money n={n} sym={sym} code={code} short />;

/** "Delivery to" and the per-country breakdown underneath it.
 *
 *  Shared by the marketer's product sheet and the admin's, so a zone reads the
 *  same on both: the country by name rather than its code, one collapsible card
 *  per country carrying its shipping fee, and the delivery fee per city. */
export function ZonesSection({
  d, sym, code, open, onToggle,
}: {
  d: Record<string, Zone>;
  sym: string;
  code: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = pdT();
  const [openZone, setOpenZone] = useState<string | null>(null);
  const zoneCodes = Object.keys(d || {});

  return (
    <>
      <div className="pd-row pd-row-tap" onClick={() => { onToggle(); setOpenZone(null); }}>
        <div className="pd-row-ic">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div className="pd-row-lbl">{t.shipsTo}</div>
        <div className="pd-row-val"><Chevron open={open} /></div>
      </div>

      {open && (
        <div className="pd-zones">
          {!zoneCodes.length ? (
            <div className="pd-zone-empty">{isAr() ? "لا توجد مناطق" : "No zones"}</div>
          ) : (
            zoneCodes.map((c) => {
              const z = d[c];
              const cities = Object.entries(z.c || {}).map(([city, v]) => ({
                city, d: Number(v.d) || 0, s: Number(v.s) || 0, eta: v.eta || null,
              }));
              const ship = cities.reduce((a, x) => Math.max(a, x.s), 0);
              const isOpen = openZone === c;
              return (
                <div className="pd-zone" key={c}>
                  <div className="pd-zone-hdr" onClick={() => setOpenZone(isOpen ? null : c)}>
                    <div className="pd-zone-name">{countryName(c)}</div>
                    <div className="pd-zone-meta">
                      {/* The country's delivery time reads on the row itself.
                          It used to be the first line inside the body, so it
                          was only there once you had opened the country to
                          look for something else. */}
                      {!!z.eta && (
                        <span className="pd-zone-eta-chip" data-no-i18n>{etaText(z.eta, isAr())}</span>
                      )}
                      <span className="pd-zone-ship-lbl">{t.ship}</span>{" "}
                      <span className="pd-zone-ship-val">
                        {cities.length ? <FreeOr n={ship} sym={sym} code={code} /> : "—"}
                      </span>{" "}
                      <Chevron open={isOpen} size={13} />
                    </div>
                  </div>
                  {isOpen && (
                    <div className="pd-zone-cities">
                      {cities.length ? (
                        cities.map((x) => (
                          <div className="pd-zone-city" key={x.city}>
                            <div className="pd-zone-city-name">{cityLabel(x.city)}</div>
                            <div className="pd-zone-city-val">
                              {/* Only where the shop said this city differs.
                                  Silence means it takes the country's time,
                                  shown on the row above. */}
                              {!!x.eta && (
                                <span className="pd-zone-eta-chip" data-no-i18n>{etaText(x.eta, isAr())}</span>
                              )}
                              <span className="pd-zone-city-lbl">{t.deliv}</span>{" "}
                              <FreeOr n={x.d} sym={sym} code={code} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="pd-zone-empty">{isAr() ? "لا توجد مدن" : "No cities"}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

    </>
  );
}
