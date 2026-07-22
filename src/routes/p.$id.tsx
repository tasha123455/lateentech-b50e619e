import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";

export const Route = createFileRoute("/p/$id")({
  head: () => ({
    meta: [
      { title: "Product · Lateen" },
      { name: "description", content: "View this product on Lateen." },
      { property: "og:title", content: "Product · Lateen" },
      { property: "og:description", content: "View this product on Lateen." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicProductPage,
});

type PublicProduct = {
  id: string;
  business_id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  price: number;
  currency: string;
  photos: string[] | null;
  sizes: string[] | null;
  colors: string[] | null;
  variant_groups: unknown;
  qty: number;
  reserved_qty: number | null;
  status: string;
  deleted_at: string | null;
};

function PublicProductPage() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  const [p, setP] = useState<PublicProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id,business_id,name,code,category,description,price,currency,photos,sizes,colors,variant_groups,qty,reserved_qty,status,deleted_at",
          )
          .eq("id", id)
          .maybeSingle();
        if (!alive) return;
        if (error) setErr(error.message);
        else if (!data || data.status !== "active" || data.deleted_at)
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
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
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
          <Link
            to="/"
            className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const photos = (p.photos ?? []).filter(Boolean);
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const colors = Array.isArray(p.colors) ? p.colors : [];
  const available = Math.max(0, (p.qty ?? 0) - (p.reserved_qty ?? 0));
  const isMarketer = !!user && role === "marketer";
  const returnTo = `/p/${p.id}`;

  return (
    <div className="mx-auto min-h-screen max-w-[520px] bg-background pb-24">
      <div className="relative aspect-square w-full bg-surface-2">
        {photos.length > 0 ? (
          <img
            src={photos[idx]}
            alt={p.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">📦</div>
        )}
        {photos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-lg font-semibold text-text-1">{p.name}</h1>
        {p.code && <div className="mt-0.5 text-xs text-text-3">{p.code}</div>}
        <div className="mt-3 flex items-baseline gap-2">
          <div className="text-2xl font-bold text-text-1">
            {Number(p.price).toLocaleString()} {p.currency}
          </div>
          <div className={`text-xs ${available > 0 ? "text-business" : "text-destructive"}`}>
            {available > 0 ? `${available} in stock` : "Out of stock"}
          </div>
        </div>

        {p.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-2">
            {p.description}
          </p>
        )}

        {(sizes.length > 0 || colors.length > 0) ? (
          <div className="mt-5 space-y-3">
            {sizes.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-text-2">Sizes</div>
                <div className="flex flex-wrap gap-1.5">
                  {sizes.map((s, i) => (
                    <span key={i} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-1">
                      {String(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {colors.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-text-2">Colors</div>
                <div className="flex flex-wrap gap-1.5">
                  {colors.map((c, i) => (
                    <span key={i} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-1">
                      {String(c)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[520px] -translate-x-1/2 border-t border-border bg-surface p-4">
        {isMarketer ? (
          <Link
            to="/dashboard"
            search={{ order: p.id } as never}
            className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
          >
            Sell this product
          </Link>
        ) : user ? (
          <Link
            to="/dashboard"
            className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
          >
            Open dashboard
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <Link
              to="/marketer/register"
              search={{ next: returnTo } as never}
              className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
            >
              Sign up to sell this product
            </Link>
            <Link
              to="/marketer/signin"
              search={{ next: returnTo } as never}
              className="block w-full rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium text-text-1"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
