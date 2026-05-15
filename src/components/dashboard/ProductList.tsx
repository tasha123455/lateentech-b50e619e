import type { Product } from "@/lib/mock-data";
import { useT } from "@/i18n/LanguageContext";

export function ProductList({ products, label = "Products" }: { products: Product[]; label?: string }) {
  const t = useT();
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-text-1">{t(label)}</h2>
      <div className="space-y-2.5">
        {products.map((p) => (
          <article key={p.id} className="rounded-2xl border border-border bg-surface p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl">{p.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-1">{t(p.name)}</div>
                <div className="text-[10px] text-text-2">{p.code}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-text-1">£{p.price}</div>
                <div className="text-[10px] text-text-2">{p.sales} {t("sold")}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
