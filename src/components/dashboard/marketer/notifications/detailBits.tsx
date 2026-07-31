import type { ReactNode } from "react";

import { splitCC, t } from "../lib/format";

/** One label/value line inside an expanded notification or transaction. */
export function DetailRow({ k, v, noTranslate }: { k: string; v: unknown; noTranslate?: boolean }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 12 }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
      <span {...(noTranslate ? { "data-no-i18n": "" } : {})} style={{ color: "var(--color-text-primary)", textAlign: "right" }}>
        {String(v)}
      </span>
    </div>
  );
}

/** Phone rendered as "+218 | 09xxxxxxx" with the bidi marks kept intact. */
export function PhoneRow({ label, phone }: { label: string; phone: unknown }) {
  const p = splitCC(phone);
  const v = p.cc ? p.cc + " | " + p.num : p.num;
  return <DetailRow k={label} v={v} />;
}

/** Variant rows use the real group names from selected_variants; the legacy
    size/colour pair is only a fallback for older orders. */
export function VariantRows({ d }: { d: Record<string, unknown> }) {
  const sv = Array.isArray(d?.selected_variants)
    ? (d.selected_variants as Array<{ name?: string; value?: string }>)
    : null;
  if (sv && sv.length) {
    return (
      <>
        {sv.map((v, i) => (
          <DetailRow key={i} k={(v && v.name) || ""} v={(v && v.value) || ""} noTranslate />
        ))}
      </>
    );
  }
  return (
    <>
      <DetailRow k={t("Size", "المقاس")} v={d?.size} noTranslate />
      <DetailRow k={t("Colour", "اللون")} v={d?.color} noTranslate />
    </>
  );
}

/** Free-text block (customer notes, admin notes, report body…). */
export function NoteBlock({
  label, text, background = "#0f0f0f", color = "var(--color-text-secondary)", marginTop = 6,
}: {
  label: string;
  text: ReactNode;
  background?: string;
  color?: string;
  marginTop?: number;
}) {
  if (!text) return null;
  return (
    <div style={{ marginTop, padding: "8px 10px", borderRadius: 8, background, color, fontSize: 11 }}>
      <b>{label}:</b> <span data-no-i18n>{text}</span>
    </div>
  );
}

/** The shared address/customer block used by both notifications and transactions. */
export function OrderDetailRows({ d }: { d: Record<string, unknown> }) {
  return (
    <>
      <DetailRow k={t("Order Code", "كود الطلبيه")} v={d.order_code} />
      <DetailRow k={t("Product", "المنتج")} v={d.product_name} noTranslate />
      <DetailRow k={t("Qty", "الكمية")} v={d.qty} />
      <DetailRow k={t("Customer", "الزبون")} v={d.customer_name} noTranslate />
      <PhoneRow label={t("Phone", "الهاتف")} phone={d.customer_phone} />
      {!!d.customer_whatsapp && <PhoneRow label={t("WhatsApp", "واتساب")} phone={d.customer_whatsapp} />}
      <DetailRow k={t("City", "المدينة")} v={d.customer_city} />
      <DetailRow k={t("Country", "الدولة")} v={d.customer_country} />
      <DetailRow k={t("Address", "العنوان")} v={d.customer_address} noTranslate />
      <VariantRows d={d} />
    </>
  );
}
