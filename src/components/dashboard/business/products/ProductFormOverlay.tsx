import type { ReactElement } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { useEffect, useMemo, useRef, useState } from "react";
import { pickFile } from "@/lib/filePicker";
import { FULFILMENTS, fulfilmentHint, fulfilmentLabel, type Fulfilment } from "@/lib/fulfilment";

import { DEFAULT_MARKET_CODE, marketOf } from "@/lib/markets";

import { useBusinessData } from "../BusinessDataProvider";
import type { Product } from "../lib/types";
import {
  isAr, priceSym, freeLbl, isFreeVal, pctOf, genCode, platformFeeForPrice,
  platThreshold, moneyParts, searchMatcher,
} from "../lib/format";
import {
  CURRENCIES, COUNTRIES, CATEGORY_DATA, CATEGORY_GROUP_AR,
  CATEGORY_ITEM_AR, LIBYA_CITIES, cityLbl,
  type Currency,
} from "../lib/constants";

type VItem = { id: number; val: string; qty: string | number; photo: string };
type VGroup = { id: number; name: string; placeholder: string; valPlaceholder: string; items: VItem[] };
type ZoneCity = { delivery: number | string; eta?: ZoneEta };
/** `eta` is how long delivery takes in that country, in days — a minimum and an
 *  optional maximum, so a shop can say "3 days" or "2 to 4 days". It rides
 *  inside the existing delivery JSON rather than in its own column, next to the
 *  country it belongs to.
 *
 *  A city may carry one too, to narrow the country's figure where a particular
 *  place is faster or slower. The country's is required; a city's is not —
 *  most shops ship everywhere on one schedule and should not have to type it
 *  fourteen times. */
type ZoneEta = { min: number | string; max: number | string };
type Zone = { cities: Record<string, ZoneCity>; shipping: number | string; eta?: ZoneEta };

let vIdCounter = 0;
let gIdCounter = 0;

const EX_PH_EN = "Example: color or size";
const EX_PH_AR = "مثال: المقاس او اللون";
const VAL_PH_EN = "Black or XL";
const VAL_PH_AR = "مثال: أسود أو XL";

function moneyH(n: number, sym: string, code?: string | null): ReactElement {
  const p = moneyParts(n, sym, code);
  const symSpan = <span className="cur-sym">{p.symbol}</span>;
  if (p.symbolFirst) return <>{symSpan}{p.amount}</>;
  return <>{p.amount}{p.spaced ? " " : ""}{symSpan}</>;
}

function calcFees(price: number, pct: number, fixedComm: number, mode: string, market: string) {
  const comm = mode === "pct" ? pctOf(price, pct) : (parseFloat(String(fixedComm || 0)) || 0);
  const platform = platformFeeForPrice(price, market);
  const total = parseFloat((comm + platform).toFixed(2));
  const commPct = mode === "pct" ? pct : (price ? parseFloat(((comm / price) * 100).toFixed(1)) : 0);
  return { comm, platform, total, commPct };
}

function hydrateVariantGroups(p: Product | null): VGroup[] {
  const norm = (v: unknown): VItem => {
    if (typeof v === "string") return { id: vIdCounter++, val: v, qty: "", photo: "" };
    const o = (v || {}) as Record<string, unknown>;
    return { id: vIdCounter++, val: typeof o.val === "string" ? o.val : "", qty: (o.qty as string | number) ?? "", photo: (o.photo as string) || "" };
  };
  if (!p) return [{ id: gIdCounter++, name: "", placeholder: isAr() ? EX_PH_AR : EX_PH_EN, valPlaceholder: isAr() ? VAL_PH_AR : VAL_PH_EN, items: [{ id: vIdCounter++, val: "", qty: "", photo: "" }] }];
  if (p.variantGroups && p.variantGroups.length) {
    return p.variantGroups.map((g) => ({
      id: gIdCounter++,
      name: (g.name as string) || "",
      placeholder: isAr() ? EX_PH_AR : EX_PH_EN,
      valPlaceholder: isAr() ? VAL_PH_AR : VAL_PH_EN,
      items: ((g.items as unknown[]) || []).map(norm),
    }));
  }
  const out: VGroup[] = [];
  if (p.sizes && p.sizes.length) out.push({ id: gIdCounter++, name: isAr() ? "المقاسات" : "Sizes", placeholder: isAr() ? EX_PH_AR : EX_PH_EN, valPlaceholder: isAr() ? VAL_PH_AR : VAL_PH_EN, items: p.sizes.map(norm) });
  if (p.colors && p.colors.length) out.push({ id: gIdCounter++, name: isAr() ? "الألوان" : "Colours", placeholder: isAr() ? EX_PH_AR : EX_PH_EN, valPlaceholder: isAr() ? VAL_PH_AR : VAL_PH_EN, items: p.colors.map(norm) });
  return out;
}

function isBlobUrl(u: unknown): boolean {
  return typeof u === "string" && u.startsWith("blob:");
}

function mpActiveMarketerCount(
  p: Product,
  orders: ReturnType<typeof useBusinessData>["orders"],
  pendingActiveStubs: ReturnType<typeof useBusinessData>["pendingActiveStubs"],
): number {
  const ACTIVE = new Set(["pending", "approved", "confirmed"]);
  try {
    const pool = [...orders, ...pendingActiveStubs];
    const ids = new Set(pool.filter((o) => o.productId === p.id && o.marketerId && ACTIVE.has(o._status)).map((o) => o.marketerId));
    return ids.size;
  } catch { return 0; }
}

export function ProductFormOverlay({ open, editing, onClose }: { open: boolean; editing: Product | null; onClose: () => void }) {
  // Holds the page still behind the sheet.
  useScrollLock(open);
  const { api, products, orders, pendingActiveStubs, profile, reloadProducts } = useBusinessData();
  const ar = isAr();

  const [photos, setPhotos] = useState<string[]>([]);
  const [coverFocusX, setCoverFocusX] = useState(50);
  const [coverFocusY, setCoverFocusY] = useState(50);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [variantMode, setVariantMode] = useState<"none" | "variants">("none");
  const [simpleQty, setSimpleQty] = useState("0");
  const [variantGroups, setVariantGroups] = useState<VGroup[]>([]);
  const [zones, setZones] = useState<Record<string, Zone>>({});
  const [cityPanelOpenFor, setCityPanelOpenFor] = useState<string | null>(null);
  /** Which country's per-city delivery times are unfolded, if any. */
  const [cityEtaOpenFor, setCityEtaOpenFor] = useState<string | null>(null);
  const [commMode, setCommMode] = useState<"pct" | "fixed">("pct");
  const [commPct, setCommPct] = useState("");
  const [commFixed, setCommFixed] = useState("");
  const [reqPhone, setReqPhone] = useState(false);
  const [fulfilment, setFulfilment] = useState<Fulfilment | null>(null);
  const [currentCode, setCurrentCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitLabel, setSubmitLabel] = useState<string | null>(null);
  const [reqPhoneInfoOpen, setReqPhoneInfoOpen] = useState(false);

  const uploadJobsRef = useRef<Promise<unknown>[]>([]);
  const lastCoverUrlRef = useRef<string | null>(null);
  const coverFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dragging: boolean; pid: number | null; startX: number; startY: number; startFx: number; startFy: number }>({ dragging: false, pid: null, startX: 0, startY: 0, startFx: 50, startFy: 50 });

  const editLockActiveCount = editing ? mpActiveMarketerCount(editing, orders, pendingActiveStubs) : 0;
  /* An admin hides a product because something about it is wrong. Letting its
     owner keep editing it while hidden means editing their way around the
     decision — and the fields would be saved against a listing nobody can
     see. The same lock the active-marketer case uses, for the same reason:
     this listing is not currently theirs to change. */
  const adminHidden = editing?.status === "hidden";
  const editLocked = editLockActiveCount > 0 || adminHidden;

  const ensureUniqueCode = (existing: string | null | undefined) => {
    let c = existing || genCode();
    const taken = new Set(products.map((x) => x.code));
    let guard = 0;
    while (taken.has(c) && guard < 50) { c = genCode(); guard++; }
    return c;
  };

  /* The market's currency, not the owner's country's.
     There is no currency field on this form any more: a product is priced in
     the one currency its market trades in, the same currency the platform fee
     and the wallet use. It used to default from profile.country, which is a
     different question — a Libyan market seller whose profile country was set
     to somewhere else would have shown one currency on the form and saved
     another. */
  const defaultCurrency = (): Currency => {
    const code = marketOf((profile?.market as string) || DEFAULT_MARKET_CODE).money.currencyCode;
    return CURRENCIES.find((c) => c.code === code)
      || { code, name: code, symbol: "", flag: "" } as Currency;
  };

  // Open / reset when opening.
  useEffect(() => {
    if (!open) return;
    const p = editing;
    setPhotos(p ? [...(p.photos || [])] : []);
    const cfx = p && p.coverFocusX != null ? Number(p.coverFocusX) : 50;
    const cfy = p && p.coverFocusY != null ? Number(p.coverFocusY) : 50;
    setCoverFocusX(cfx); setCoverFocusY(cfy);
    lastCoverUrlRef.current = (p?.photos || [])[0] || null;
    const groups = hydrateVariantGroups(p);
    setVariantGroups(groups);
    setVariantMode(groups.length ? "variants" : "none");
    setSimpleQty(p && p.qty != null && Number(p.qty) >= 0 ? String(Math.round(Number(p.qty))) : "0");
    const zz: Record<string, Zone> = p ? JSON.parse(JSON.stringify(p.delivery || {})) : {};
    Object.keys(zz).forEach((code) => {
      const z = zz[code];
      if (!z.cities) z.cities = {};
      let s = 0;
      Object.values(z.cities).forEach((c) => { const cs = Number((c as { delivery?: unknown; shipping?: unknown }).shipping) || 0; if (cs > s) s = cs; });
      if (z.shipping == null || z.shipping === "") z.shipping = s || "";
    });
    setZones(zz);
    setCommMode((p?.commMode as "pct" | "fixed") || "pct");
    setSelectedCurrency(p?.currency || defaultCurrency());
    setCurrentCode(ensureUniqueCode(p?.code));
    setName(p?.name || "");
    setDesc(p?.desc || "");
    setPrice(p?.price ? String(p.price) : "");
    setCostPrice(p?.costPrice ? String(p.costPrice) : "");
    setSelectedCategory(p?.category || "");
    setCategorySearch("");
    setCategoryPanelOpen(false);
    setCommPct(p?.commPct ? String(p.commPct) : "");
    setCommFixed(p?.commFixed ? String(p.commFixed) : "");
    setReqPhone(!!p?.reqPhone);
    // Editing a product listed before this choice existed leaves it unset
    // rather than picking one on the owner's behalf.
    setFulfilment(p?.fulfilment ?? null);
    setCountryDropdownOpen(false);
    setCityPanelOpenFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Cover focus point drag.
  useEffect(() => {
    const frame = coverFrameRef.current;
    if (!frame) return;
    const onDown = (e: PointerEvent) => {
      if (!photos.length) return;
      if (e.target instanceof HTMLElement && e.target.closest(".lp-cover-remove")) return;
      dragRef.current = { dragging: true, pid: e.pointerId, startX: e.clientX, startY: e.clientY, startFx: coverFocusX, startFy: coverFocusY };
      try { frame.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.dragging || e.pointerId !== d.pid) return;
      const r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dx = ((e.clientX - d.startX) / r.width) * 100;
      const dy = ((e.clientY - d.startY) / r.height) * 100;
      setCoverFocusX(Math.max(0, Math.min(100, d.startFx - dx)));
      setCoverFocusY(Math.max(0, Math.min(100, d.startFy - dy)));
    };
    const onUp = () => { dragRef.current.dragging = false; dragRef.current.pid = null; };
    frame.addEventListener("pointerdown", onDown);
    frame.addEventListener("pointermove", onMove);
    frame.addEventListener("pointerup", onUp);
    frame.addEventListener("pointercancel", onUp);
    return () => {
      frame.removeEventListener("pointerdown", onDown);
      frame.removeEventListener("pointermove", onMove);
      frame.removeEventListener("pointerup", onUp);
      frame.removeEventListener("pointercancel", onUp);
    };
  }, [photos.length, coverFocusX, coverFocusY]);

  if (!open) return null;

  /* The market this business lists into, and the one currency it prices in.
     A product already saved keeps whatever it was stored with, so nothing
     that exists is re-denominated behind anybody's back. */
  const marketCode = (profile?.market as string) || DEFAULT_MARKET_CODE;
  const market = marketOf(marketCode);
  const marketCurrency =
    CURRENCIES.find((c) => c.code === market.money.currencyCode)
    || { code: market.money.currencyCode, name: market.money.currencyCode, symbol: "", flag: market.flag };

  const priceNum = parseFloat(price) || 0;
  const commPctNum = parseFloat(commPct) || 0;
  const commFixedNum = parseFloat(commFixed) || 0;
  const { comm, platform, commPct: finalPct } = calcFees(priceNum, commPctNum, commFixedNum, commMode, marketCode);
  const total = priceNum - comm - platform;
  const curCode = selectedCurrency ? selectedCurrency.code : marketCurrency.code;
  const sumSym = ar && curCode === "LYD" ? "د.ل" : curCode;
  const fmtSum = (n: number) => (ar && curCode === "LYD" ? moneyH(n, "د.ل", "LYD") : <>{n.toFixed(2)} <span className="cur-sym">{sumSym}</span></>);
  const platformFixed = priceNum <= platThreshold(marketCode);
  const platformPct = priceNum > 0 ? Math.round((platform / priceNum) * 100) : 0;

  // ---- photos ----
  const onPhotosSelected = (files: File[]) => {
    const slots: { file: File; localUrl: string }[] = [];
    const newPhotos = [...photos];
    for (const file of files) {
      if (newPhotos.length >= 6) break;
      const localUrl = URL.createObjectURL(file);
      newPhotos.push(localUrl);
      slots.push({ file, localUrl });
    }
    setPhotos(newPhotos);
    const job = (async () => {
      await Promise.all(slots.map(async (s) => {
        try {
          const url = await api.uploadPhoto(s.file);
          setPhotos((cur) => cur.map((u) => (u === s.localUrl ? url : u)));
          try { URL.revokeObjectURL(s.localUrl); } catch { /* ignore */ }
        } catch (e) {
          console.error("[Lateen] uploadPhoto", e);
          setPhotos((cur) => cur.filter((u) => u !== s.localUrl));
          alert(ar ? "فشل رفع الصورة." : "Photo upload failed.");
        }
      }));
    })();
    uploadJobsRef.current.push(job);
    job.finally(() => { uploadJobsRef.current = uploadJobsRef.current.filter((j) => j !== job); });
  };

  const removePhoto = (i: number) => setPhotos((cur) => cur.filter((_, idx) => idx !== i));

  const coverUrl = photos[0] || null;
  if (coverUrl !== lastCoverUrlRef.current) {
    lastCoverUrlRef.current = coverUrl;
    if (coverFocusX !== 50 || coverFocusY !== 50) { setCoverFocusX(50); setCoverFocusY(50); }
  }

  // ---- category ----
  const renderCategoryList = () => {
    /* Both languages regardless of which one the form is in: the Arabic labels
       used to be searchable only while the page itself was Arabic. The matcher
       forgives a typo and folds the Arabic letter variants. */
    const match = searchMatcher(categorySearch);
    const rows: ReactElement[] = [];
    let any = false;
    CATEGORY_DATA.forEach((section) => {
      const groupLbl = ar ? (CATEGORY_GROUP_AR[section.group] || section.group) : section.group;
      const groupMatches = match([section.group, CATEGORY_GROUP_AR[section.group]].filter(Boolean).join(" "));
      const items = section.items.filter(
        (it) => groupMatches || match([it, CATEGORY_ITEM_AR[it]].filter(Boolean).join(" ")),
      );
      if (!items.length) return;
      any = true;
      rows.push(<div key={"g-" + section.group} className="lp-category-group-label" data-no-i18n="">{groupLbl}</div>);
      items.forEach((it) => {
        const lbl = ar ? (CATEGORY_ITEM_AR[it] || it) : it;
        rows.push(
          <div key={it} className="lp-category-option" data-no-i18n="" onClick={() => { setSelectedCategory(it); setCategoryPanelOpen(false); }}>
            {lbl}
          </div>,
        );
      });
    });
    if (!any) rows.push(<div key="empty" className="lp-category-empty" data-no-i18n="">{ar ? "لا توجد فئات مطابقة" : "No matching categories"}</div>);
    return rows;
  };

  // ---- currency / country dropdowns ----
  const soonBadge = <span className="soon-badge">{ar ? "قريباً" : "soon"}</span>;
  const lyd = CURRENCIES.find((c) => c.code === "LYD");
  const eur = CURRENCIES.find((c) => c.code === "EUR");
  const usd = CURRENCIES.find((c) => c.code === "USD");

  /* The picker names each currency the shortest way that is still unambiguous:
     the flag, then what somebody would actually write. The full English name
     alongside the code and the symbol said the same thing three times.
     The dinar needs no symbol beside it — د.ل is the symbol — while the euro
     and the dollar are named in Arabic and carry theirs. Name and symbol are
     separate elements rather than one string, so the reading direction puts
     them in the right order without a second set of labels for RTL. */
  const ly = COUNTRIES.find((c) => c.code === "LY");

  const selectCountry = (code: string) => {
    setZones((z) => (z[code] ? z : { ...z, [code]: { cities: {}, shipping: "" } }));
    setCountryDropdownOpen(false);
  };
  const removeZone = (code: string) => setZones((z) => { const n = { ...z }; delete n[code]; return n; });

  // ---- variants ----
  const addVariantGroup = () => setVariantGroups((g) => [...g, { id: gIdCounter++, name: "", placeholder: ar ? EX_PH_AR : EX_PH_EN, valPlaceholder: ar ? VAL_PH_AR : VAL_PH_EN, items: [] }]);
  const removeVariantGroup = (gid: number) => setVariantGroups((g) => g.filter((x) => x.id !== gid));
  const renameVariantGroup = (gid: number, nm: string) => setVariantGroups((g) => g.map((x) => (x.id === gid ? { ...x, name: nm } : x)));
  const addVariant = (gid: number) => setVariantGroups((g) => g.map((x) => (x.id === gid ? { ...x, items: [...x.items, { id: vIdCounter++, val: "", qty: 0, photo: "" }] } : x)));
  const removeVariant = (gid: number, id: number) => setVariantGroups((g) => g.map((x) => (x.id === gid ? { ...x, items: x.items.filter((it) => it.id !== id) } : x)));
  const updateVariant = (gid: number, id: number, val: string) => setVariantGroups((g) => g.map((x) => (x.id === gid ? { ...x, items: x.items.map((it) => (it.id === id ? { ...it, val } : it)) } : x)));
  const updateVariantQty = (gid: number, id: number, val: string) => setVariantGroups((g) => g.map((x) => (x.id === gid ? { ...x, items: x.items.map((it) => (it.id === id ? { ...it, qty: val } : it)) } : x)));
  const onVariantPhotoSelected = async (gid: number, id: number, file: File) => {
    const localUrl = URL.createObjectURL(file);
    updateVariantPhoto(gid, id, localUrl);
    const job = (async () => {
      try {
        const url = await api.uploadPhoto(file);
        updateVariantPhoto(gid, id, url);
        try { URL.revokeObjectURL(localUrl); } catch { /* ignore */ }
      } catch (e) {
        console.error("[Lateen] variant photo upload", e);
        updateVariantPhoto(gid, id, "");
      }
    })();
    uploadJobsRef.current.push(job);
    job.finally(() => { uploadJobsRef.current = uploadJobsRef.current.filter((j) => j !== job); });
  };
  const updateVariantPhoto = (gid: number, id: number, photo: string) => setVariantGroups((g) => g.map((x) => (x.id === gid ? { ...x, items: x.items.map((it) => (it.id === id ? { ...it, photo } : it)) } : x)));

  const groupTotals = variantGroups.filter((g) => g.items.length).map((g) => g.items.reduce((s, x) => s + (Number(x.qty) || 0), 0));
  const totalStock = groupTotals.length ? Math.min(...groupTotals) : 0;

  // ---- zones ----
  const addCity = (code: string, cityVal: string) => {
    const city = cityVal.trim();
    setZones((z) => {
      if (!city || !z[code] || z[code].cities[city]) return z;
      return { ...z, [code]: { ...z[code], cities: { ...z[code].cities, [city]: { delivery: "" } } } };
    });
  };
  const toggleCityCheck = (code: string, cityEn: string) => {
    setZones((z) => {
      if (!z[code]) return z;
      const cities = { ...z[code].cities };
      if (cities[cityEn]) delete cities[cityEn]; else cities[cityEn] = { delivery: "" };
      return { ...z, [code]: { ...z[code], cities } };
    });
  };
  const toggleAllCities = (code: string) => {
    setZones((z) => {
      if (!z[code]) return z;
      const all = LIBYA_CITIES.every((c) => !!z[code].cities[c.en]);
      const cities: Record<string, ZoneCity> = {};
      if (!all) LIBYA_CITIES.forEach((c) => { cities[c.en] = z[code].cities[c.en] || { delivery: "" }; });
      return { ...z, [code]: { ...z[code], cities } };
    });
  };
  const removeCity = (code: string, city: string) => setZones((z) => { const cities = { ...z[code].cities }; delete cities[city]; return { ...z, [code]: { ...z[code], cities } }; });
  const clampNum = (val: string) => { const n = parseFloat(val); return val === "" || val == null || isNaN(n) ? "" : (n < 0 ? 0 : n); };
  /** Spreads the city rather than replacing it: the cost is no longer the only
   *  thing a city holds, and rebuilding it from scratch would wipe the delivery
   *  time the moment its price was edited. */
  const updateCityCost = (code: string, city: string, val: string) => setZones((z) => (!z[code]?.cities[city] ? z : { ...z, [code]: { ...z[code], cities: { ...z[code].cities, [city]: { ...z[code].cities[city], delivery: clampNum(val) } } } }));
  const updateZoneShipping = (code: string, val: string) => setZones((z) => (!z[code] ? z : { ...z, [code]: { ...z[code], shipping: clampNum(val) } }));
  /** Whole days only, and nothing past a year — a delivery time is a small
   *  number and a stray keystroke should not be able to say 4000. */
  const clampDays = (val: string) => {
    const n = parseInt(val, 10);
    return val === "" || isNaN(n) ? "" : Math.min(365, Math.max(0, n));
  };
  const updateZoneEta = (code: string, key: "min" | "max", val: string) =>
    setZones((z) => {
      if (!z[code]) return z;
      const eta = { min: "", max: "", ...(z[code].eta || {}), [key]: clampDays(val) };
      return { ...z, [code]: { ...z[code], eta } };
    });

  /** The same, for one city inside a country. */
  const updateCityEta = (code: string, city: string, key: "min" | "max", val: string) =>
    setZones((z) => {
      const cur = z[code]?.cities?.[city];
      if (!cur) return z;
      const eta = { min: "", max: "", ...(cur.eta || {}), [key]: clampDays(val) };
      return { ...z, [code]: { ...z[code], cities: { ...z[code].cities, [city]: { ...cur, eta } } } };
    });

  // ---- submit ----
  const frozenBlock = () => {
    if (profile && profile.frozen_at) {
      alert(ar ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen");
      return true;
    }
    return false;
  };

  const submitProduct = async () => {
    if (submitting) return;
    if (frozenBlock()) return;
    const nm = name.trim();
    const p = priceNum;
    const cPct = commPctNum;
    const cFixed = commFixedNum;
    if (!nm || !p || (!cPct && !cFixed)) {
      alert(ar ? "يرجى إدخال الاسم والسعر والعمولة." : "Please fill in name, price and commission.");
      return;
    }
    if (!desc.trim()) { alert(ar ? "يرجى إدخال وصف المنتج." : "Please add a product description."); return; }
    if (!selectedCategory) { alert(ar ? "يرجى اختيار فئة للمنتج." : "Please select a category."); return; }
    if (!photos.length) { alert(ar ? "يرجى إضافة صورة واحدة على الأقل للمنتج." : "Please add at least one product photo."); return; }
    /* Required when listing something new, so everything from here on has an
       answer. Not required when editing: a product listed before this choice
       existed should not be held hostage by it to fix a typo. */
    if (!editing && !fulfilment) {
      alert(ar ? "يرجى اختيار طريقة التسليم: حجز أو تسليم فوري." : "Please choose how it is fulfilled: Reserve or Instant delivery.");
      return;
    }
    if (variantMode === "none") {
      if (simpleQty === "" || simpleQty == null || isNaN(Number(simpleQty)) || Number(simpleQty) < 0) {
        alert(ar ? "يرجى إدخال كمية صحيحة." : "Please enter a valid quantity.");
        return;
      }
    } else {
      for (const vg of variantGroups) {
        const vgName = (vg.name || "").trim();
        const vgFilled = vg.items.filter((it) => (it.val || "").toString().trim());
        const vgBlank = vg.items.filter((it) => !(it.val || "").toString().trim());
        const vgIsEmpty = !vgName && !vgFilled.length;
        if (vgIsEmpty) continue;
        if (vgBlank.length) { alert(ar ? "يرجى تعبئة قيمة لكل خيار تضيفه، أو احذف الخيار الفارغ." : "Please fill in a value for every variant you add, or remove the empty one."); return; }
        if (!vgFilled.length) { alert(ar ? `يرجى إضافة قيمة واحدة على الأقل لخيار "${vgName || "الخيار"}"، أو احذفه.` : `Please add at least one value for the "${vgName || "variant"}" variant, or remove it.`); return; }
        const vgNoQty = vgFilled.filter((it) => it.qty === "" || it.qty == null || isNaN(Number(it.qty)));
        if (vgNoQty.length) { alert(ar ? "يرجى إدخال الكمية لكل قيمة." : "Please enter a quantity for every variant value."); return; }
      }
    }
    if (!Object.keys(zones).length) { alert(ar ? "أضف منطقة توصيل واحدة على الأقل." : "Please add at least one delivery zone."); return; }

    type SavedEta = { min: number; max: number | null };
    type SavedCity = { shipping: number; delivery: number; eta?: SavedEta };
    type SavedZone = {
      cities: Record<string, SavedCity>;
      shipping: number;
      eta?: SavedEta;
    };
    /* Two boxes filled in the wrong order is a range that reads backwards, so
       they swap rather than being saved that way. One figure and no second is
       "3 days" rather than a range, which is what `max: null` means. */
    const readEta = (e: { min?: number | string; max?: number | string } | undefined): SavedEta | null => {
      const min = e && e.min !== "" && e.min != null ? Number(e.min) : null;
      if (min == null || isNaN(min)) return null;
      const maxRaw = e && e.max !== "" && e.max != null ? Number(e.max) : null;
      const max = maxRaw != null && !isNaN(maxRaw) ? maxRaw : null;
      return max != null && max < min ? { min: max, max: min } : { min, max };
    };

    const validZones: Record<string, SavedZone> = {};
    const missingEta: string[] = [];
    for (const [code, z] of Object.entries(zones)) {
      const zShip = Number(z.shipping) || 0;
      const vc: Record<string, SavedCity> = {};
      for (const [city, costs] of Object.entries(z.cities || {})) {
        const raw = costs ? costs.delivery : "";
        if (raw === "" || raw == null || isNaN(Number(raw))) continue;
        const cityEta = readEta(costs?.eta);
        vc[city] = { shipping: zShip, delivery: Math.max(0, Number(raw)), ...(cityEta ? { eta: cityEta } : {}) };
      }
      if (!Object.keys(vc).length) continue;
      const saved: SavedZone = { cities: vc, shipping: zShip };
      const zoneEta = readEta(z.eta);
      /* The country's delivery time is required. A marketer quoting a customer
         cannot be left guessing, and every product listed from here on can
         answer "how long?" without anyone having to ask the shop. A city's is
         optional — it only narrows the country's where somewhere is faster or
         slower, and most shops ship everywhere on one schedule. */
      if (!zoneEta) missingEta.push(code);
      else saved.eta = zoneEta;
      validZones[code] = saved;
    }
    if (missingEta.length) {
      alert(ar
        ? "يرجى إدخال مدة التوصيل لكل دولة أضفتها."
        : "Please enter the delivery time for every country you added.");
      return;
    }
    if (!Object.keys(validZones).length) { alert(ar ? "أضف مدينة واحدة على الأقل مع سعر التوصيل." : "Please add at least one city with a delivery price."); return; }

    let code = ensureUniqueCode(editing ? currentCode : null);
    setCurrentCode(code);
    setSubmitting(true);
    setSubmitLabel("Uploading photos…");
    try {
      const jobs = [...uploadJobsRef.current];
      if (jobs.length) await Promise.allSettled(jobs);
      const { comm: finalComm, platform: finalPlatform, total: finalTotal, commPct: finalCommPct } = calcFees(p, cPct, cFixed, commMode, marketCode);
      const cleanGroups = variantMode === "variants"
        ? variantGroups.map((g) => ({
            name: (g.name || "Variant").trim() || "Variant",
            items: g.items.map((x) => ({ val: (x.val || "").trim(), qty: Number(x.qty) || 0, photo: (typeof x.photo === "string" && !isBlobUrl(x.photo)) ? x.photo : "" })).filter((x) => x.val),
          })).filter((g) => g.items.length)
        : [];
      const sizesGroup = cleanGroups.find((g) => /size/i.test(g.name));
      const colorsGroup = cleanGroups.find((g) => /colou?r/i.test(g.name));
      const qty = variantMode === "variants"
        ? (cleanGroups.length ? Math.min(...cleanGroups.map((g) => g.items.reduce((s, x) => s + (Number(x.qty) || 0), 0))) : 0)
        : (Number(simpleQty) || 0);
      const cleanPhotos = photos.filter((u) => typeof u === "string" && !isBlobUrl(u));
      const payload: Record<string, unknown> = {
        code, name: nm, description: desc.trim(), category: selectedCategory,
        price: p, cost_price: parseFloat(costPrice) || 0, qty, currency: selectedCurrency,
        comm_pct: finalCommPct, comm_fixed: finalComm, comm_mode: commMode,
        platform_fee: finalPlatform, total_fee_per_unit: finalTotal,
        variant_groups: cleanGroups.map((g) => ({ name: g.name, items: g.items })),
        sizes: sizesGroup ? sizesGroup.items.map((x) => x.val) : [],
        colors: colorsGroup ? colorsGroup.items.map((x) => x.val) : [],
        delivery: validZones, photos: cleanPhotos,
        cover_focus_x: coverFocusX, cover_focus_y: coverFocusY,
        biz_name: null, require_additional_phone: reqPhone,
        fulfilment,
      };
      if (editing) payload.id = editing.id;
      setSubmitLabel(ar ? "جارٍ الحفظ…" : "Saving…");
      let codeLen = 6, attempt = 0, saved = false;
      while (!saved) {
        try {
          await api.upsertProduct(payload as never);
          saved = true;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          const isDup = !editing && e && (e.code === "23505" || /duplicate key|unique constraint/i.test(e.message || ""));
          if (isDup && attempt < 8) {
            attempt++;
            if (attempt >= 4) codeLen = 7;
            code = genCode(codeLen);
            payload.code = code;
            setCurrentCode(code);
            continue;
          }
          throw err;
        }
      }
      onClose();
      await reloadProducts();
    } catch (e) {
      console.error("[Lateen] upsertProduct", e);
      alert((ar ? "تعذّر حفظ المنتج: " : "Could not save product: ") + ((e as Error)?.message || String(e)));
    } finally {
      setSubmitting(false);
      setSubmitLabel(null);
    }
  };

  const lockAttr = editLocked ? { disabled: true } : {};

  return (
    <div className={`overlay${open ? " open" : ""}`} id="form-overlay">
      <div className="overlay-bg" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        <div className="lp-top-row">
          <div className="lp-back-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="lp-page-title">{editing ? "Edit product" : "Add a product"}</h1>
        </div>

        <div className="lp-card">
          <div className="lp-card-head">
            <div className="lp-card-head-left">
              <div className="lp-step-badge">1</div>
              <div className="lp-card-title">Product info</div>
            </div>
            <div className="lp-icon-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8m18 0-2-4H5L3 8m18 0H3m9 4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>

          {editLocked && (
            <div style={{ display: "block", margin: "0 0 14px", padding: "10px 12px", borderRadius: 10, background: "rgba(148,163,184,0.10)", border: "0.5px solid rgba(148,163,184,0.35)", color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
              {ar
                ? adminHidden
                  ? "🔒 تم إخفاء هذا المنتج من قبل الإدارة، لذلك لا يمكن تعديله. تواصل مع الدعم إذا كنت تعتقد أن هذا خطأ."
                  : `🔒 هذا المنتج مقفل بالكامل — لديه ${editLockActiveCount === 1 ? "مسوّق نشط واحد" : editLockActiveCount === 2 ? "مسوّقين نشطين" : editLockActiveCount + " مسوّقين نشطين"} حالياً، لذلك لا يمكن تعديله أو حذفه حتى تكتمل طلباتهم.`
                : adminHidden
                  ? "🔒 This product has been hidden by an administrator, so it can't be edited. Contact support if you think that's a mistake."
                  : `🔒 This product is fully locked — it has ${editLockActiveCount} active marketer${editLockActiveCount === 1 ? "" : "s"} right now, so it can't be edited or deleted until those orders complete.`}
            </div>
          )}

          <label className="lp-field-label">Product photos <span className="lp-req">*</span></label>
          <div className="lp-cover-frame" id="lp-cover-frame" ref={coverFrameRef} style={editLocked ? { pointerEvents: "none", opacity: 0.55 } : undefined}>
            {!coverUrl ? (
              <div className="lp-cover-placeholder" onClick={() => pickFile({ multiple: true, onFiles: onPhotosSelected })}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Tap to upload photos
                <div className="lp-sub">First photo becomes the cover image</div>
              </div>
            ) : (
              <>
                <img className="lp-cover-img" alt="" draggable={false} src={coverUrl} style={{ objectPosition: `${coverFocusX}% ${coverFocusY}%` }} />
                <button type="button" className="lp-cover-remove" onClick={(e) => { e.stopPropagation(); removePhoto(0); }}>×</button>
              </>
            )}
          </div>
          {!!coverUrl && <div className="lp-cover-caption">This is what the marketer sees before tapping on the product to see the full photo</div>}
          <div className="lp-photo-grid" id="photo-grid" style={editLocked ? { pointerEvents: "none", opacity: 0.55 } : undefined}>
            {photos.slice(1).map((src, i) => (
              <div className="photo-preview" key={i}>
                <img src={src} />
                <button className="photo-remove" onClick={() => removePhoto(i + 1)}>×</button>
              </div>
            ))}
            {photos.length < 6 && (
              <div className="add-photo-btn" onClick={() => pickFile({ multiple: true, onFiles: onPhotosSelected })}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <div className="add-photo-label">Add photo</div>
              </div>
            )}
          </div>

          <label className="lp-field-label">Product name <span className="lp-req">*</span></label>
          <input className="lp-input" type="text" value={name} disabled={editLocked} onChange={(e) => setName(e.target.value)} placeholder={ar ? "مثال: حذاء رياضي" : "e.g. Running shoes"} data-no-i18n="" />

          <div>
            <label className="lp-field-label">Selling price <span className="lp-req">*</span></label>
            <div style={{ position: "relative" }}>
              <span className="price-prefix" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", pointerEvents: "none" }}>{priceSym(selectedCurrency)}</span>
              <input className="lp-input" type="number" value={price} disabled={editLocked} step="0.01" style={{ paddingLeft: 44 }} placeholder="0.00" onChange={(e) => {
                setPrice(e.target.value);
                const p = parseFloat(e.target.value) || 0;
                if (commMode === "pct") { const pct = parseFloat(commPct) || 0; if (pct) setCommFixed(String(pctOf(p, pct))); }
                else { const fixed = parseFloat(commFixed) || 0; if (p && fixed) setCommPct(((fixed / p) * 100).toFixed(1)); }
              }} />
            </div>
          </div>

          <label className="lp-field-label">Description <span className="lp-req">*</span></label>
          <textarea className="lp-input lp-textarea" value={desc} disabled={editLocked} onChange={(e) => setDesc(e.target.value)} placeholder={ar ? "ما الذي يميّز هذا المنتج؟ الخامة، المقاس، طريقة الاستخدام…" : "What makes this product worth selling? Materials, fit, use case…"} data-no-i18n="" />

          <label className="lp-field-label">Category <span className="lp-req">*</span></label>
          <div className="lp-category-picker">
            <div className={`lp-category-picker-input${categoryPanelOpen ? " open" : ""}`} tabIndex={0} onClick={() => !editLocked && setCategoryPanelOpen((v) => !v)} style={editLocked ? { pointerEvents: "none", opacity: 0.55 } : undefined}>
              <span className={`cp-value${selectedCategory ? "" : " placeholder"}`} data-no-i18n={selectedCategory ? "" : undefined}>
                {selectedCategory ? (ar ? (CATEGORY_ITEM_AR[selectedCategory] || selectedCategory) : selectedCategory) : "Select category"}
              </span>
            </div>
            <div className={`lp-category-panel${categoryPanelOpen ? " open" : ""}`}>
              <div className="lp-category-search-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                <input type="text" value={categorySearch} placeholder="Search category..." onClick={(e) => e.stopPropagation()} onChange={(e) => setCategorySearch(e.target.value)} />
              </div>
              <div className="lp-category-list">{categoryPanelOpen && renderCategoryList()}</div>
            </div>
          </div>

          {/* Product code: auto-generated, not shown to the business owner */}
          <div style={{ display: "none" }}>
            <label className="lp-field-label lp-field-label-row">
              Product code
              <span className="lp-badge">Auto-generated</span>
            </label>
            <input className="lp-input" type="text" id="product-code-display" value={currentCode} disabled readOnly style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }} />
          </div>
        </div>

        {/* STEP 2: Variants & inventory */}
        <div className="lp-card">
          <div className="lp-card-head">
            <div className="lp-card-head-left">
              <div className="lp-step-badge">2</div>
              <div className="lp-card-title">Variants &amp; inventory <span className="lp-opt">(optional)</span></div>
            </div>
            <div className="lp-icon-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div className="lp-variant-toggle">
            <button type="button" className={`lp-vt-btn${variantMode === "none" ? " active" : ""}`} disabled={editLocked} onClick={() => setVariantMode("none")}>No variants</button>
            <button type="button" className={`lp-vt-btn${variantMode === "variants" ? " active" : ""}`} disabled={editLocked} onClick={() => { setVariantMode("variants"); setVariantGroups((g) => (g.length ? g : [{ id: gIdCounter++, name: "", placeholder: ar ? EX_PH_AR : EX_PH_EN, valPlaceholder: ar ? VAL_PH_AR : VAL_PH_EN, items: [{ id: vIdCounter++, val: "", qty: "", photo: "" }] }])); }}>Has variants</button>
          </div>
          {variantMode === "none" ? (
            <div>
              <label className="lp-field-label">Quantity <span className="lp-req">*</span></label>
              <div className="lp-stepper">
                <button type="button" className="lp-stepper-btn" disabled={editLocked} onClick={() => setSimpleQty((v) => String(Math.max(0, (parseInt(v || "0", 10) || 0) - 1)))} aria-label="decrease">−</button>
                <input className="lp-stepper-val" type="number" min={0} step={1} inputMode="numeric" value={simpleQty} disabled={editLocked} onChange={(e) => { let v = parseInt(e.target.value || "", 10); if (!Number.isFinite(v) || v < 0) v = 0; setSimpleQty(String(v)); }} />
                <button type="button" className="lp-stepper-btn" disabled={editLocked} onClick={() => setSimpleQty((v) => String(Math.max(0, (parseInt(v || "0", 10) || 0) + 1)))} aria-label="increase">+</button>
              </div>
            </div>
          ) : (
            <div>
              <div id="variant-groups-container" style={editLocked ? { pointerEvents: "none", opacity: 0.55 } : undefined}>
                {!variantGroups.length ? (
                  <div className="vb-empty" style={{ border: "0.5px dashed var(--color-border-secondary)", borderRadius: 12, marginBottom: 12 }}>No variants. Tap &quot;Add another variant&quot; below.</div>
                ) : variantGroups.map((g) => (
                  <div className="variant-builder" key={g.id}>
                    <div className="vb-header">
                      <input className="vg-name-input" type="text" value={g.name} placeholder={g.placeholder} onChange={(e) => renameVariantGroup(g.id, e.target.value)} data-no-i18n="" />
                      <button className="vg-remove-btn" onClick={() => removeVariantGroup(g.id)} title="Remove group">×</button>
                    </div>
                    <div>
                      {g.items.length ? g.items.map((it) => {
                        const qVal = it.qty === "" || it.qty == null || isNaN(Number(it.qty)) || Number(it.qty) < 0 ? 0 : Number(it.qty);
                        return (
                          <div className="vb-item" key={it.id}>
                            <input className="vb-val-input" type="text" value={it.val} placeholder={g.valPlaceholder} data-no-i18n=""
                              onChange={(e) => updateVariant(g.id, it.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariant(g.id); } }} />
                            <button className="vb-remove" onClick={() => removeVariant(g.id, it.id)}>×</button>
                            <div className="vb-stepper">
                              <button type="button" className="vb-stepper-btn" onClick={() => updateVariantQty(g.id, it.id, String(Math.max(0, qVal - 1)))} aria-label="decrease">−</button>
                              <input className="vb-stepper-val" type="number" min={0} step={1} inputMode="numeric" value={qVal} onChange={(e) => { let v = parseInt(e.target.value || "", 10); if (!Number.isFinite(v) || v < 0) v = 0; updateVariantQty(g.id, it.id, String(v)); }} />
                              <button type="button" className="vb-stepper-btn" onClick={() => updateVariantQty(g.id, it.id, String(qVal + 1))} aria-label="increase">+</button>
                            </div>
                            {it.photo ? (
                              <div className="vb-thumb"><img src={it.photo} /><button className="vb-thumb-x" onClick={() => updateVariantPhoto(g.id, it.id, "")}>×</button></div>
                            ) : (
                              <button type="button" className="vb-thumb vb-thumb-add" title={ar ? "صورة" : "Photo"}
                                onClick={() => pickFile({ onFiles: (files) => { if (files[0]) void onVariantPhotoSelected(g.id, it.id, files[0]); } })}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
                              </button>
                            )}
                          </div>
                        );
                      }) : <div className="vb-empty">Skip if not applicable</div>}
                    </div>
                    <div className="vb-add-btn" onClick={() => addVariant(g.id)}>+ Add value</div>
                  </div>
                ))}
              </div>
              <button type="button" className="lp-add-variant-btn" disabled={editLocked} onClick={addVariantGroup}>+ Add another variant</button>
              {variantGroups.some((g) => g.items.length) && (
                <div className="lp-total-stock-bar" style={{ display: "flex" }}>
                  <span className="lp-total-stock-label">{ar ? "إجمالي الكميه" : "Total stock"}</span>
                  <span className="lp-total-stock-val">{totalStock.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 3: Shipping & delivery */}
        <div className="lp-card">
          <div className="lp-card-head">
            <div className="lp-card-head-left">
              <div className="lp-step-badge">3</div>
              <div className="lp-card-title">Shipping &amp; delivery</div>
            </div>
            <div className="lp-icon-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <label className="lp-field-label" style={{ marginTop: 0 }}>Countries and cities available for delivery <span className="lp-req">*</span></label>

          <div id="zone-builder-list" style={editLocked ? { pointerEvents: "none", opacity: 0.55 } : undefined}>
            {Object.keys(zones).map((code) => {
              const z = zones[code];
              const ck = Object.keys(z.cities);
              const isLY = code === "LY";
              const countryMeta = COUNTRIES.find((c) => c.code === code);
              const flag = countryMeta ? countryMeta.flag : "🌐";
              const cname = ar ? (countryMeta?.name === "Libya" ? "ليبيا" : countryMeta?.name || code) : (countryMeta?.name || code);
              return (
                <div className="lp-country-card-2" key={code}>
                  <div className="lp-country-card-head"><span>{flag} {cname}</span><span className="rm" onClick={() => removeZone(code)}>✕</span></div>
                  <div className="lp-cost-row">
                    <span className="cost-label">{ar ? `تكلفة الشحن لـ ${cname} (اختياري)` : `Shipping cost for ${cname} (optional)`}</span>
                    <input type="number" min={0} step="0.01" value={z.shipping === "" || z.shipping == null ? "" : z.shipping} placeholder="0.00" onChange={(e) => updateZoneShipping(code, e.target.value)} />
                    {isFreeVal(z.shipping) && <span style={{ marginInlineStart: 8, fontSize: 11, fontWeight: 700, color: "#34c77b" }}>{freeLbl()}</span>}
                  </div>
                  {/* One field rather than words floating in a row: the two
                      boxes, the dash between them and the unit live inside a
                      single frame, so it reads as one duration control.
                      The country is not repeated — the card is titled with it
                      two lines above. */}
                  <div className="lp-eta-field">
                    <label className="lp-field-label">{ar ? "مدة التوصيل" : "Delivery time"} <span className="lp-req">*</span></label>
                    <div className="lp-eta-box">
                      <input
                        type="number" min={0} max={365} step="1" inputMode="numeric"
                        className="lp-eta-inp"
                        value={z.eta?.min === "" || z.eta?.min == null ? "" : z.eta.min}
                        placeholder={ar ? "من" : "from"}
                        onChange={(e) => updateZoneEta(code, "min", e.target.value)}
                      />
                      <span className="lp-eta-dash" aria-hidden>–</span>
                      <input
                        type="number" min={0} max={365} step="1" inputMode="numeric"
                        className="lp-eta-inp"
                        value={z.eta?.max === "" || z.eta?.max == null ? "" : z.eta.max}
                        placeholder={ar ? "إلى" : "to"}
                        onChange={(e) => updateZoneEta(code, "max", e.target.value)}
                      />
                      <span className="lp-eta-unit">{ar ? "يوم" : "days"}</span>
                    </div>
                  </div>

                  {!!ck.length && (
                    <>
                      <div className="lp-city-values-label"><span>{ar ? "المدينة" : "City"}</span><span>{ar ? "تكلفة التوصيل" : "Delivery cost"}</span></div>
                      {ck.map((city) => (
                        <div className="lp-city-row-flex" key={city}>
                          <span className="city-name">{isLY ? cityLbl(city) : city} <span className="x-mark" onClick={() => removeCity(code, city)}>✕</span></span>
                          <input type="number" min={0} step="0.01" value={z.cities[city].delivery === "" || z.cities[city].delivery == null ? "" : z.cities[city].delivery} placeholder="0.00" onChange={(e) => updateCityCost(code, city, e.target.value)} />
                          {isFreeVal(z.cities[city].delivery) && <span style={{ marginInlineStart: 8, fontSize: 11, fontWeight: 700, color: "#34c77b" }}>{freeLbl()}</span>}
                        </div>
                      ))}

                      {/* Folded away, because it is optional and it is one row
                          per city — open by default it would bury the delivery
                          costs above it under fourteen boxes nobody asked for.
                          A city left blank simply takes the country's time. */}
                      <button
                        type="button"
                        className="lp-city-eta-toggle"
                        aria-expanded={cityEtaOpenFor === code}
                        onClick={() => setCityEtaOpenFor((v) => (v === code ? null : code))}
                      >
                        <span>{ar ? "مدة التوصيل لكل مدينة (اختياري)" : "Delivery time per city (optional)"}</span>
                        <span className={"lp-city-eta-chev" + (cityEtaOpenFor === code ? " open" : "")}>▾</span>
                      </button>
                      {cityEtaOpenFor === code && (
                        <div className="lp-city-eta-body">
                          <div className="lp-city-eta-note">
                            {ar
                              ? "اتركها فارغة وتأخذ المدينة مدة الدولة."
                              : "Leave a city blank and it takes the country's time."}
                          </div>
                          {ck.map((city) => (
                            <div className="lp-city-eta-row" key={city}>
                              <span className="city-name">{isLY ? cityLbl(city) : city}</span>
                              <div className="lp-eta-box lp-eta-box-sm">
                                <input
                                  type="number" min={0} max={365} step="1" inputMode="numeric"
                                  className="lp-eta-inp"
                                  value={z.cities[city].eta?.min === "" || z.cities[city].eta?.min == null ? "" : z.cities[city].eta!.min}
                                  placeholder={ar ? "من" : "from"}
                                  onChange={(e) => updateCityEta(code, city, "min", e.target.value)}
                                />
                                <span className="lp-eta-dash" aria-hidden>–</span>
                                <input
                                  type="number" min={0} max={365} step="1" inputMode="numeric"
                                  className="lp-eta-inp"
                                  value={z.cities[city].eta?.max === "" || z.cities[city].eta?.max == null ? "" : z.cities[city].eta!.max}
                                  placeholder={ar ? "إلى" : "to"}
                                  onChange={(e) => updateCityEta(code, city, "max", e.target.value)}
                                />
                                <span className="lp-eta-unit">{ar ? "يوم" : "days"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {isLY ? (
                    <>
                      <div onClick={() => setCityPanelOpenFor((v) => (v === code ? null : code))} style={{ width: "100%", padding: "11px 12px", fontSize: 13, border: "1.5px dashed var(--color-border-secondary)", borderRadius: 12, background: "transparent", color: "#34c77b", fontWeight: 700, fontFamily: "var(--font-sans)", marginTop: 10, textAlign: "center", cursor: "pointer" }}>
                        {ck.length ? (ar ? "+ إضافة مدينة" : "+ Add city") : (ar ? "اختر مدينة…" : "Select a city…")}
                      </div>
                      {cityPanelOpenFor === code && (
                        <div style={{ marginTop: 10, border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, overflow: "hidden", background: "var(--color-background-primary)" }}>
                          <div onClick={() => setCityPanelOpenFor(null)} style={{ padding: "9px 12px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#34c77b", background: "var(--color-background-secondary)", cursor: "pointer" }}>{ar ? "تم ✓" : "Done ✓"}</div>
                          <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)" }}>
                            <input type="checkbox" checked={LIBYA_CITIES.every((c) => !!z.cities[c.en])} onChange={() => toggleAllCities(code)} style={{ width: 18, height: 18, accentColor: "#34c77b", flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>{ar ? "الكل" : "All"}</span>
                          </label>
                          <div id={"city-panel-" + code} style={{ maxHeight: 260, overflowY: "auto", padding: "2px 12px" }}>
                            {LIBYA_CITIES.map((c) => (
                              <label key={c.en} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                                <input type="checkbox" checked={!!z.cities[c.en]} onChange={() => toggleCityCheck(code, c.en)} style={{ width: 18, height: 18, accentColor: "#34c77b", flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{cityLbl(c.en)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <input type="text" id={"new-city-" + code} placeholder={ar ? "أضف مدينة…" : "Add a city…"} style={{ flex: 1, padding: "9px 10px", fontSize: 13, border: "0.5px solid var(--color-border-secondary)", borderRadius: 10, background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none", fontFamily: "var(--font-sans)" }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = e.target as HTMLInputElement; addCity(code, el.value); el.value = ""; } }} />
                      <button onClick={(e) => { const input = (e.currentTarget.previousSibling as HTMLInputElement); addCity(code, input.value); input.value = ""; }} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "none", background: "#34c77b", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}>{ar ? "إضافة" : "Add"}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {countryDropdownOpen && (
            <div className="currency-search-wrap" style={{ display: "block" }}>
              <svg className="currency-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input className="currency-search" type="text" placeholder="Search countries…" readOnly />
            </div>
          )}
          <div className={`currency-dropdown${countryDropdownOpen ? " open" : ""}`}>
            {countryDropdownOpen && (
              <>
                {ly && <div className="currency-option" onClick={() => selectCountry("LY")}><span className="curr-flag">{ly.flag}</span><span className="curr-label">{ly.name}</span><span className="curr-sub">{ly.code}</span></div>}
                <div className="currency-option disabled" onClick={(e) => e.stopPropagation()}><span className="curr-label" style={{ color: "var(--color-text-tertiary)" }}>{ar ? "دول أخرى" : "More countries"}</span><span style={{ marginLeft: "auto" }}>{soonBadge}</span></div>
              </>
            )}
          </div>
          <button className="lp-add-variant-btn" disabled={editLocked} onClick={() => setCountryDropdownOpen((v) => !v)} style={{ marginBottom: 0 }}>+ Add a country</button>
        </div>

        {/* STEP 4: Marketer profit */}
        <div className="lp-card">
          <div className="lp-card-head">
            <div className="lp-card-head-left">
              <div className="lp-step-badge">4</div>
              <div className="lp-card-title">Marketer profit <span className="lp-req">*</span></div>
            </div>
            <div className="lp-icon-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div className="lp-comm-card">
            <div className="lp-comm-title">Set what marketers earn</div>
            <div className="lp-comm-sub">The higher the commission, the more marketers you&apos;ll attract to promote your product.</div>
            <div className="lp-segmented">
              <button type="button" id="mode-pct" className={commMode === "pct" ? "active" : ""} disabled={editLocked} onClick={() => setCommMode("pct")}>Percentage</button>
              <button type="button" id="mode-fixed" className={commMode === "fixed" ? "active" : ""} disabled={editLocked} onClick={() => setCommMode("fixed")}>Fixed amount</button>
            </div>
            {commMode === "pct" ? (
              <div className="lp-comm-row">
                <input className="lp-input" type="number" min={1} max={100} step="0.1" style={{ flex: 1 }} value={commPct} disabled={editLocked} placeholder="e.g. 12" onChange={(e) => { setCommPct(e.target.value); const pct = parseFloat(e.target.value) || 0; if (priceNum && pct) setCommFixed(String(pctOf(priceNum, pct))); }} />
                <span className="lp-comm-unit">% of product price</span>
              </div>
            ) : (
              <div className="lp-comm-row">
                <input className="lp-input" type="number" min={0} step="0.01" style={{ flex: 1 }} value={commFixed} disabled={editLocked} placeholder="0.00" onChange={(e) => { setCommFixed(e.target.value); const fixed = parseFloat(e.target.value) || 0; if (priceNum && fixed) setCommPct(((fixed / priceNum) * 100).toFixed(1)); }} />
                <span className="lp-comm-unit">{curCode + " per sale"}</span>
              </div>
            )}
            <div className="lp-conversion-note" data-no-i18n="">
              {commMode === "pct"
                ? (ar ? <>مبلغ ربح المسوق: <b>{moneyH(pctOf(priceNum, commPctNum), "د.ل", "LYD")}</b> لكل قطعه</> : <>Fixed equivalent at current price: <b>{pctOf(priceNum, commPctNum).toFixed(2)} {curCode}</b> per sale</>)
                : (ar ? <>نسبه ربح المسوق : <b>{(priceNum ? (commFixedNum / priceNum) * 100 : 0).toFixed(1)}%</b> لكل قطعه</> : <>Percentage equivalent at current price: <b>{(priceNum ? (commFixedNum / priceNum) * 100 : 0).toFixed(1)}%</b> per sale</>)}
            </div>
            {/* Reserve or instant — one or the other, never both. Picking one
                clears the other by construction: there is a single value, so
                the two buttons cannot both be on. */}
            <div style={{ marginTop: 14 }}>
              <div className="lp-comm-title" data-no-i18n>
                {ar ? "طريقة التسليم" : "How it is fulfilled"}
              </div>
              <div className="lp-segmented" style={{ marginTop: 8, marginBottom: 6 }}>
                {FULFILMENTS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    data-no-i18n
                    className={fulfilment === f ? "active" : ""}
                    disabled={editLocked}
                    aria-pressed={fulfilment === f}
                    onClick={() => setFulfilment(f)}
                  >
                    {fulfilmentLabel(f, ar)}
                  </button>
                ))}
              </div>
              <div className="lp-conversion-note" data-no-i18n style={{ marginTop: 0 }}>
                {fulfilment
                  ? fulfilmentHint(fulfilment, ar)
                  : ar
                    ? "اختر واحدة — تظهر للمسوقين مع المنتج."
                    : "Pick one — marketers see it alongside the product."}
              </div>
            </div>

            <div className="lp-reqphone-row">
              <div className="lp-reqphone-label-wrap">
                <span className="lp-reqphone-label">{ar ? "طلب رقم هاتف إضافي من الزبون" : "Require Additional Phone Number from customer"}</span>
                <button type="button" className="mp-info-btn" aria-label="Info" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReqPhoneInfoOpen(true); }}>!</button>
              </div>
              <button type="button" className={`mp-switch${reqPhone ? " on" : ""}`} role="switch" aria-checked={reqPhone} disabled={editLocked} onClick={() => setReqPhone((v) => !v)}>
                <span className="mp-switch-knob" />
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="lp-card">
          <div className="lp-card-head">
            <div className="lp-card-title">Summary</div>
            <div className="lp-icon-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12h6m-6 4h6M9 8h1M7 4h10a2 2 0 0 1 2 2v13l-3-2-2 2-2-2-2 2-2-2-2 2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div className="lp-summary-row"><span>Product price</span><span>{fmtSum(priceNum)}</span></div>
          <div className="lp-summary-row"><span data-no-i18n="">{ar ? `عمولة المسوق (${finalPct}%)` : `Marketer commission (${finalPct}%)`}</span><span>{fmtSum(comm)}</span></div>
          <div className="lp-summary-row"><span data-no-i18n="">{platformFixed ? (ar ? "عمولة المنصة" : "Platform commission") : (ar ? `عمولة المنصة (${platformPct}%)` : `Platform commission (${platformPct}%)`)}</span><span>{fmtSum(platform)}</span></div>
          <div className="lp-summary-row total"><span>Your total</span><span className="lp-val">{fmtSum(total)}</span></div>
        </div>

        <div className="lp-bottom">
          <button className="lp-btn-primary" disabled={submitting || editLocked} style={editLocked ? { opacity: 0.5, cursor: "not-allowed" } : (submitting ? { opacity: 0.6, pointerEvents: "none" } : undefined)} onClick={() => void submitProduct()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {submitLabel || "Publish product"}
          </button>
          <button className="lp-btn-secondary" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
        </div>
      </div>

      {reqPhoneInfoOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setReqPhoneInfoOpen(false)}>
          <div style={{ background: "#1a2030", borderRadius: 16, padding: 18, width: "100%", maxWidth: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{ar ? "طلب رقم هاتف إضافي من الزبون" : "Require Additional Phone Number from customer"}</div>
            <div style={{ fontSize: 13, color: "#c7ccd6", lineHeight: 1.6 }}>
              {ar
                ? "عند تفعيل هذا الخيار، لازم المسوق يدخل رقم هاتف إضافي من الزبون قبل تسجيل الطلب. هذا يساعدك في التواصل مع الزبون برقم آخر عند الحاجة. إذا كان الخيار غير مفعّل، يبقى الرقم الإضافي اختياري، ويتم تسجيل الطلب برقم واحد فقط من الزبون."
                : "When this option is enabled, marketers must provide an additional phone number from the customer before submitting an order. This helps you contact the customer using an alternative number when needed. If this option is disabled, the additional phone number remains optional, and only one phone number will be mandatory from the customer."}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setReqPhoneInfoOpen(false)} style={{ background: "#34c77b", color: "#0f1420", border: 0, borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{ar ? "حسناً" : "Got it"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
