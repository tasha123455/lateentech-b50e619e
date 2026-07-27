import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";

type VariantItem = { val?: string; photo?: string; qty?: number | string | null } | string;
type VariantGroup = { name?: string; items?: VariantItem[] };
type DeliveryZone = { cities?: Record<string, { shipping?: number; delivery?: number }> };

type PublicProduct = {
  id: string;
  business_id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  price: number;
  currency: string | { code?: string; symbol?: string; name?: string } | null;
  photos: string[] | null;
  sizes: unknown[] | null;
  colors: unknown[] | null;
  variant_groups: VariantGroup[] | null;
  qty: number;
  reserved_qty: number | null;
  status: string;
  deleted_at: string | null;
  delivery: Record<string, DeliveryZone> | null;
  biz_name: string | null;
};

type Review = {
  id: string;
  marketer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author_name: string;
  photo_url: string | null;
  avatar_path: string | null;
};

async function avatarSignedUrl(path: string | null | undefined): Promise<string> {
  if (!path) return "";
  try {
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    return data?.signedUrl ?? "";
  } catch {
    return "";
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  LY: "Libya", EG: "Egypt", TN: "Tunisia", DZ: "Algeria", MA: "Morocco",
  SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", KW: "Kuwait", BH: "Bahrain",
  OM: "Oman", JO: "Jordan", LB: "Lebanon", IQ: "Iraq", SY: "Syria",
  YE: "Yemen", PS: "Palestine", SD: "Sudan", TR: "Turkey",
};

function toLabel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.name ?? o.label ?? o.value ?? o.val ?? o.code ?? o.symbol ?? "");
  }
  return "";
}

function currencySymbol(v: PublicProduct["currency"], lang: "en" | "ar"): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const o = v as Record<string, unknown>;
  const code = String(o.code ?? "").trim().toUpperCase();
  const sym = String(o.symbol ?? "").trim();
  if (code === "LYD" || sym === "ل.د" || sym === "د.ل") {
    return lang === "ar" ? "\u2066د.ل\u2069" : "LYD";
  }
  return sym || code || "";
}

function normVariantGroups(p: PublicProduct): { name: string; items: { val: string; photo: string; qty: number | null }[] }[] {
  const norm = (v: VariantItem) => {
    if (typeof v === "string") return { val: v, photo: "", qty: null as number | null };
    const q = v && v.qty != null && v.qty !== "" && Number.isFinite(Number(v.qty)) ? Math.max(0, Number(v.qty)) : null;
    return { val: (v && v.val) || "", photo: (v && v.photo) || "", qty: q };
  };
  const vg = Array.isArray(p.variant_groups) ? p.variant_groups : [];
  if (vg.length) {
    return vg
      .map((g) => ({ name: g.name || "", items: (g.items || []).map(norm).filter((x) => x.val) }))
      .filter((g) => g.items.length);
  }
  const legacy: { name: string; items: { val: string; photo: string; qty: number | null }[] }[] = [];
  if (Array.isArray(p.sizes) && p.sizes.length) legacy.push({ name: "Size", items: p.sizes.map((s) => norm(toLabel(s))) });
  if (Array.isArray(p.colors) && p.colors.length) legacy.push({ name: "Colour", items: p.colors.map((s) => norm(toLabel(s))) });
  return legacy;
}

export function PublicProduct({ id }: { id: string }) {
  const { user, role, loading: authLoading } = useAuth();
  const { lang, withLang } = useLanguage();
  const nav = useNavigate();
  const [p, setP] = useState<PublicProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [shipsOpen, setShipsOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewAvatars, setReviewAvatars] = useState<Record<string, string>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user && role === "marketer") {
      nav({ to: withLang("/dashboard"), search: { prod: id, order: undefined }, replace: true });
    }
  }, [authLoading, user, role, id, nav, withLang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("products_public_view")
          .select("id,business_id,name,code,category,description,price,currency,photos,sizes,colors,variant_groups,qty,reserved_qty,status,deleted_at,delivery,biz_name")
          .eq("id", id)
          .maybeSingle();
        if (!alive) return;
        if (error) setErr(error.message);
        else if (!data || (data as PublicProduct).status !== "active" || (data as PublicProduct).deleted_at)
          setErr("This product is no longer available.");
        else setP(data as PublicProduct);
      } catch (e) {
        if (!alive) return;
        console.error("[public product] failed to load", e);
        setErr("This product is no longer available.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("list_product_reviews" as never, { _product_id: id } as never);
        if (!alive) return;
        if (!error && Array.isArray(data)) {
          const rows = data as Review[];
          setReviews(rows);
          const entries = await Promise.all(
            rows
              .filter((r) => r.avatar_path)
              .map(async (r) => [r.id, await avatarSignedUrl(r.avatar_path)] as const),
          );
          if (!alive) return;
          setReviewAvatars(Object.fromEntries(entries));
        }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [id]);

  const variantGroups = useMemo(() => (p ? normVariantGroups(p) : []), [p]);
  const currencyLabel = p ? currencySymbol(p.currency, lang) : "";
  const available = p ? Math.max(0, (p.qty ?? 0) - (p.reserved_qty ?? 0)) : 0;

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length : 0;

  if (loading || (user && role === "marketer")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text-2">
        Loading…
      </div>
    );
  }
  if (err || !p) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-text-1">Product unavailable</h1>
          <p className="mt-2 text-sm text-text-2">{err ?? "Not found."}</p>
          <Link to={withLang("/")} className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go home</Link>
        </div>
      </div>
    );
  }

  const photos = (p.photos ?? []).filter(Boolean);
  const returnTo = withLang(`/p/${p.id}`);
  const isMarketer = !!user && role === "marketer";

  const share = async () => {
    const url = (typeof location !== "undefined" ? location.origin : "") + returnTo;
    const text = `${p.name} — ${Number(p.price).toLocaleString()} ${currencyLabel}`;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as Navigator).share({ title: p.name, text, url });
        return;
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert("Product link copied");
    } catch {
      alert(`${text}\n${url}`);
    }
  };

  const deliveryEntries = Object.entries(p.delivery ?? {});

  const onGalleryTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onGalleryTouchEnd = (e: TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || photos.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    setIdx((i) => (dx < 0 ? Math.min(photos.length - 1, i + 1) : Math.max(0, i - 1)));
  };

  return (
    <div className={`mx-auto min-h-screen max-w-[520px] bg-background ${isMarketer || user ? "pb-28" : "pb-40"}`}>
      <div
        className="relative aspect-square w-full overflow-hidden bg-surface-2"
        dir="ltr"
        onTouchStart={onGalleryTouchStart}
        onTouchEnd={onGalleryTouchEnd}
      >
        {photos.length > 0 ? (
          <div
            className="flex h-full w-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${idx * 100}%)` }}
          >
            {photos.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={p.name}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={i === 0 ? "high" : "auto"}
                className="h-full w-full flex-shrink-0 object-cover cursor-zoom-in bg-surface-2"
                onClick={() => setLightbox(photos[i])}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">📦</div>
        )}
        {photos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/60"}`} />
            ))}
          </div>
        )}
        <button
          onClick={share}
          aria-label="Share"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-lg font-semibold text-text-1"><span data-no-i18n>{p.name}</span></h1>
        {p.code && <div className="mt-0.5 text-xs text-text-3">Code: <span data-no-i18n>{p.code}</span></div>}
        <div className="mt-3 flex items-baseline gap-2">
          <div className="text-2xl font-bold text-text-1">
            {Number(p.price).toLocaleString()} <span className="text-sm font-medium" data-no-i18n>{currencyLabel}</span>
          </div>
          <div className={`text-xs ${available > 0 ? "text-business" : "text-destructive"}`}>
            {available > 0 ? `${available} in stock` : "Out of stock"}
          </div>
        </div>

        {p.description && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-text-2">Description</div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-text-2" data-no-i18n>{p.description}</p>
          </div>
        )}

        {variantGroups.length > 0 && (
          <div className="mt-5 space-y-4">
            {variantGroups.map((g, gi) => {
              const hasPhotos = g.items.some((x) => x.photo);
              return (
                <div key={gi}>
                  <div className="mb-2 text-xs font-medium text-text-2" data-no-i18n>{g.name}</div>
                  {hasPhotos ? (
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((it, ii) => {
                        const oos = it.qty === 0;
                        return (
                          <button
                            key={ii}
                            onClick={() => !oos && it.photo && setLightbox(it.photo)}
                            disabled={oos}
                            className={`relative w-[74px] rounded-lg border border-border bg-surface p-1 text-left transition ${oos ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-primary/60"}`}
                          >
                            {it.photo ? (
                              <img src={it.photo} alt="" loading="lazy" decoding="async" className="h-16 w-full rounded object-cover bg-surface-2" />
                            ) : (
                              <div className="flex h-16 w-full items-center justify-center rounded bg-surface-2 text-2xl">·</div>
                            )}
                            <div className="mt-1 truncate px-0.5 text-[11px] text-text-1" data-no-i18n>{it.val}</div>
                            <div className="px-0.5 pb-0.5 text-[10px] text-text-3">
                              {it.qty == null ? "" : oos ? "Out of stock" : `${it.qty} left`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((it, ii) => {
                        const oos = it.qty === 0;
                        return (
                          <span
                            key={ii}
                            className={`rounded-full border border-border bg-surface px-3 py-1 text-xs ${oos ? "opacity-40 line-through" : "text-text-1"}`}
                          >
                            <span data-no-i18n>{it.val}</span>
                            {it.qty != null && !oos && <span className="ml-1 text-text-3">· {it.qty}</span>}
                            {oos && <span className="ml-1 text-destructive">· out of stock</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-xl border border-border bg-surface">
          <button
            onClick={() => setShipsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-medium text-text-1">Delivery to</span>
            <svg className={`transition-transform ${shipsOpen ? "rotate-180" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {shipsOpen && (
            <div className="border-t border-border px-3 py-2">
              {deliveryEntries.length === 0 ? (
                <div className="px-2 py-3 text-xs text-text-3">No delivery zones</div>
              ) : (
                deliveryEntries.map(([code, z]) => {
                  const cities = Object.entries(z.cities || {});
                  const maxShip = cities.reduce((a, [, v]) => Math.max(a, Number(v.shipping) || 0), 0);
                  const open = zoneOpen === code;
                  return (
                    <div key={code} className="border-b border-border last:border-b-0">
                      <button
                        onClick={() => setZoneOpen(open ? null : code)}
                        className="flex w-full items-center justify-between px-2 py-2.5 text-left"
                      >
                        <span className="text-sm text-text-1">{COUNTRY_NAMES[code] || code}</span>
                        <span className="flex items-center gap-2 text-xs text-text-2">
                          <span>Shipping: {maxShip ? `${maxShip} ${currencyLabel}` : "—"}</span>
                          <svg className={`transition-transform ${open ? "rotate-180" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </button>
                      {open && (
                        <div className="px-2 pb-3">
                          {cities.length === 0 ? (
                            <div className="px-1 py-1 text-xs text-text-3">No cities</div>
                          ) : (
                            <div className="grid gap-1.5">
                              {cities.map(([city, v]) => (
                                <div key={city} className="flex items-center justify-between rounded bg-surface-2 px-2 py-1.5 text-xs">
                                  <span className="text-text-1">{city}</span>
                                  <span className="text-text-2">
                                    Delivery: {Number(v.delivery) || 0} {currencyLabel}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-text-1">Reviews ({reviews.length})</div>
            {reviews.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-text-2">
                <span style={{ color: "#e9b949", letterSpacing: 1 }}>
                  {"★".repeat(Math.round(avgRating))}{"☆".repeat(5 - Math.round(avgRating))}
                </span>
                <span>{avgRating.toFixed(1)}</span>
              </div>
            )}
          </div>
          {reviews.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-xs text-text-3">
              No reviews yet.
            </div>
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => {
                const initials = (r.author_name || "M").trim().charAt(0).toUpperCase();
                const date = new Date(r.created_at).toLocaleDateString(lang === "ar" ? "ar-LY" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
                const avatarUrl = reviewAvatars[r.id];
                return (
                  <div key={r.id} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" loading="lazy" decoding="async" className="h-6 w-6 flex-shrink-0 rounded-full object-cover bg-surface-2" />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-text-2">{initials}</span>
                        )}
                        <span className="text-xs text-text-1" data-no-i18n>{r.author_name}</span>
                      </div>
                      <div className="text-[11px] text-text-3">{date}</div>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "#e9b949", letterSpacing: 1 }}>
                      {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                    </div>
                    {r.comment && (
                      <div className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-text-2" data-no-i18n>{r.comment}</div>
                    )}
                    {r.photo_url && (
                      <div
                        className="mt-2 h-14 w-14 cursor-pointer overflow-hidden rounded-lg border border-border"
                        onClick={() => setLightbox(r.photo_url)}
                      >
                        <img src={r.photo_url} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[520px] -translate-x-1/2 border-t border-border bg-surface p-4">
        {isMarketer ? (
          <Link to={withLang("/dashboard")} search={{ prod: p.id, order: undefined }} className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">
            Sell this product
          </Link>
        ) : user ? (
          <Link to={withLang("/dashboard")} search={{ prod: undefined, order: undefined }} className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">
            Open dashboard
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <Link to={withLang("/marketer/register")} search={{ next: returnTo } as never} className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">
              Create an account to sell the product
            </Link>
            <Link to={withLang("/marketer/signin")} search={{ next: returnTo } as never} className="block w-full rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium text-text-1">
              Sign in
            </Link>
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
