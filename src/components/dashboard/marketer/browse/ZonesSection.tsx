import { useState } from "react";

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

  /* One line for the whole product, so a marketer sees how long delivery takes
     without opening anything. With several countries it is the span across all
     of them — the exact figure per country is inside each card below. */
  const etas = zoneCodes.map((c) => d[c].eta).filter(Boolean) as Array<{ min: number; max: number | null }>;
  const overall = etas.length
    ? {
        min: Math.min(...etas.map((e) => e.min)),
        max: Math.max(...etas.map((e) => (e.max != null ? e.max : e.min))),
      }
    : null;

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

      {!!overall && (
        <div className="pd-row">
          <div className="pd-row-ic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </div>
          <div className="pd-row-lbl">{t.etaLbl}</div>
          <div className="pd-row-val" data-no-i18n>{t.eta(overall.min, overall.max)}</div>
        </div>
      )}

      {open && (
        <div className="pd-zones">
          {!zoneCodes.length ? (
            <div className="pd-zone-empty">{isAr() ? "لا توجد مناطق" : "No zones"}</div>
          ) : (
            zoneCodes.map((c) => {
              const z = d[c];
              const cities = Object.entries(z.c || {}).map(([city, v]) => ({
                city, d: Number(v.d) || 0, s: Number(v.s) || 0,
              }));
              const ship = cities.reduce((a, x) => Math.max(a, x.s), 0);
              const isOpen = openZone === c;
              return (
                <div className="pd-zone" key={c}>
                  <div className="pd-zone-hdr" onClick={() => setOpenZone(isOpen ? null : c)}>
                    <div className="pd-zone-name">{countryName(c)}</div>
                    <div className="pd-zone-meta">
                      <span className="pd-zone-ship-lbl">{t.ship}</span>{" "}
                      <span className="pd-zone-ship-val">
                        {cities.length ? <FreeOr n={ship} sym={sym} code={code} /> : "—"}
                      </span>{" "}
                      <Chevron open={isOpen} size={13} />
                    </div>
                  </div>
                  {isOpen && (
                    <div className="pd-zone-cities">
                      {!!z.eta && (
                        <div className="pd-zone-city pd-zone-eta">
                          <div className="pd-zone-city-name">{t.etaLbl}</div>
                          <div className="pd-zone-city-val" data-no-i18n>{t.eta(z.eta.min, z.eta.max)}</div>
                        </div>
                      )}
                      {cities.length ? (
                        cities.map((x) => (
                          <div className="pd-zone-city" key={x.city}>
                            <div className="pd-zone-city-name">{cityLabel(x.city)}</div>
                            <div className="pd-zone-city-val">
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
