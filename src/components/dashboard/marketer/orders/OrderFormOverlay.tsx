import { useEffect, useMemo, useRef, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { COUNTRY_NAMES, PHONE_RE_LOCAL, platThreshold } from "../lib/constants";
import { codPaysParts, genCode, isAr, pctTxt, stripCC, today2 } from "../lib/format";
import {
  buildSelectedVariantsPayload, calcFee, cityLabel, currentDeliveryFor, formVariantGroups,
  maxQtyForSelection, syncLegacyVariants,
} from "../lib/mappers";
import { pickReceiptFile } from "../lib/receiptPicker";
import { removeDraft, upsertDraft } from "../lib/storage";
import type { CurrentDelivery, MarketerOrder } from "../lib/types";
import { FreeOrMoney, Money } from "../ui/Money";
import { usePhotoLightbox } from "../ui/PhotoLightbox";
import { ProductPickerOverlay } from "./ProductPickerOverlay";
import { pkT } from "../browse/pdText";

export type OrderFormSeed = {
  order: MarketerOrder | null;
  /** Set when a draft's receipt was uploaded from the orders list. */
  receiptUrl?: string;
};

type UploadState = { status: "idle" | "uploading" | "done" | "error"; label: string };

export function OrderFormOverlay({
  open, seed, onClose, onOpenPayDetails, onOpenDepositInfo, onSubmitted,
}: {
  open: boolean;
  seed: OrderFormSeed | null;
  onClose: () => void;
  onOpenPayDetails: () => void;
  onOpenDepositInfo: (cod: { pays: number; sym: string; code: string; delivery: number; shipping: number } | null) => void;
  onSubmitted: () => void;
}) {
  const { api, userId, productsMap, orders, setOrders, profile, reloadOrders, refreshWalletAndPayout } = useMarketerData();
  const lightbox = usePhotoLightbox();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ccode, setCcode] = useState("+218");
  const [phone, setPhone] = useState("");
  const [wcode, setWcode] = useState("+218");
  const [whatsapp, setWhatsapp] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [productKey, setProductKey] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [hasReceipt, setHasReceipt] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [upload, setUpload] = useState<UploadState>({ status: "idle", label: "Tap to upload receipt" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [staleBanner, setStaleBanner] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const seededRef = useRef<OrderFormSeed | null>(null);

  const currentProduct = productKey ? productsMap[productKey] || null : null;
  const vgList = useMemo(() => formVariantGroups(currentProduct), [currentProduct]);
  const currentDelivery: CurrentDelivery | null =
    currentProduct && countryCode && city ? currentDeliveryFor(currentProduct, countryCode, city) : null;

  const waRequired = !!currentProduct?.reqPhone;
  const needVariant = vgList.some((g) => !(selectedVariants[g.name] || "").trim());

  /* ── Seeding: reset for a new order, prefill when editing ── */
  useEffect(() => {
    if (!open) return;
    if (seededRef.current === seed) return;
    seededRef.current = seed;

    const o = seed?.order || null;
    setStaleBanner("");
    if (!o) {
      setEditingId(null);
      setName(""); setCcode("+218"); setPhone(""); setWcode("+218"); setWhatsapp(""); setWaOpen(false);
      setProductKey(""); setSelectedVariants({}); setQty(1);
      setCountryCode(""); setCity(""); setAddress(""); setNotes("");
      setHasReceipt(false); setReceiptUrl("");
      setUpload({ status: "idle", label: "Tap to upload receipt" });
      return;
    }

    setEditingId(o.id);
    setName(o.customerName || "");
    const p = stripCC(o.phone);
    const w = stripCC(o.whatsapp);
    setPhone(p.num);
    if (p.cc) setCcode(p.cc);
    setWhatsapp(w.num);
    if (w.cc) setWcode(w.cc);
    setWaOpen(!!o.whatsapp);
    setProductKey(o.productKey || "");
    setQty(o.qty || 1);
    setCountryCode(o.countryCode || "");
    setCity(o.city || "");
    setAddress(o.address || "");
    setNotes(o.notes || "");

    const freshReceipt = seed?.receiptUrl || "";
    const receipt = freshReceipt || o.receiptUrl || "";
    setHasReceipt(!!freshReceipt || !!o.hasReceipt);
    setReceiptUrl(receipt);
    if (freshReceipt) setUpload({ status: "done", label: "✓ Receipt ready" });
    else if (o.hasReceipt) setUpload({ status: "done", label: "✓ Receipt already uploaded" });
    else setUpload({ status: "idle", label: "Tap to upload receipt" });

    // Restore the variant selection, falling back to the legacy size/colour pair.
    const sel: Record<string, string> = {};
    if (Array.isArray(o.selectedVariants) && o.selectedVariants.length) {
      o.selectedVariants.forEach((sv) => {
        if (sv && sv.name) sel[sv.name] = sv.value || "";
      });
    } else {
      const live = o.productKey ? productsMap[o.productKey] : null;
      const groups = (live && live.vg) || [];
      groups.forEach((g) => {
        const legacy = syncLegacyVariants({ [g.name]: "x" });
        if (legacy.size && o.size) sel[g.name] = o.size;
        else if (legacy.color && o.color) sel[g.name] = o.color;
      });
    }
    setSelectedVariants(sel);

    // Warn when the live product drifted from what the draft captured.
    const live = o.productKey ? productsMap[o.productKey] : null;
    if (live && o.productName && live.name && live.name !== o.productName) {
      setStaleBanner(
        isAr()
          ? `⚠ قد يكون اسم أو تفاصيل هذا المنتج ("${o.productName}") قد تغيّرت منذ حفظ هذه المسودة. المنتج الحالي: "${live.name}". يرجى المراجعة قبل الإرسال.`
          : `⚠ This product's details may have changed since this draft was saved. It was "${o.productName}" — it now shows as "${live.name}". Please review before sending.`,
      );
    }
  }, [open, seed, productsMap]);

  useEffect(() => {
    if (!open) seededRef.current = null;
  }, [open]);

  // A product that demands a second number keeps the WhatsApp block open.
  useEffect(() => {
    if (waRequired) setWaOpen(true);
  }, [waRequired]);

  // The sheet is modal.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  /* ── Derived money ── */
  const fee = currentProduct ? calcFee(currentProduct, qty) : null;
  const sym = currentProduct?.currency?.symbol;
  const curCode = currentProduct?.currency?.code;
  const ship = currentDelivery ? Number(currentDelivery.shipping || 0) : 0;
  const deliv = currentDelivery ? Number(currentDelivery.delivery || 0) : 0;
  const subtotal = Number(currentProduct?.price || 0) * qty;
  const total = subtotal + ship + deliv;
  const codPays = fee ? Math.max(0, parseFloat((total - fee.totalFee).toFixed(2))) : 0;
  const codParts = codPaysParts(deliv > 0, ship > 0);

  const price = currentProduct?.price || 0;
  const platFixed = price <= platThreshold(currentProduct?.market);
  const platPct = price > 0 && fee ? Math.round((fee.platformPerUnit / price) * 100) : 0;
  const commAmt = fee ? parseFloat((fee.commPerUnit * qty).toFixed(2)) : 0;
  const platAmt = fee ? parseFloat((fee.platformPerUnit * qty).toFixed(2)) : 0;

  /* ── Draft persistence ── */
  const buildLocalOrder = (status: string): MarketerOrder => {
    const p = currentProduct;
    const f = p ? calcFee(p, qty) : { commPerUnit: 0, platformPerUnit: 0, feePerUnit: 0, totalFee: 0 };
    const legacy = syncLegacyVariants(selectedVariants);
    const existing = editingId ? orders.find((o) => o.id === editingId) : null;
    const fmtPhone = (raw: string, cc: string) => {
      const digits = (raw || "").replace(/\D/g, "");
      return digits ? (cc || "+218") + digits : "";
    };
    return {
      id: editingId || (existing && existing.id) || genCode(),
      dbId: existing ? existing.dbId : undefined,
      reserveDate: (existing && existing.reserveDate) || today2(),
      customerName: name.trim(),
      phone: fmtPhone(phone.trim(), ccode),
      whatsapp: fmtPhone(whatsapp.trim(), wcode),
      countryCode: currentDelivery ? currentDelivery.countryCode : (existing && existing.countryCode) || "",
      country: currentDelivery ? currentDelivery.country : (existing && existing.country) || "",
      city: currentDelivery ? currentDelivery.city : (existing && existing.city) || "",
      address: address.trim(),
      productKey,
      productName: p ? p.name : (existing && existing.productName) || "(no product)",
      price: p ? p.price : 0,
      pct: p ? p.pct : 0,
      earn: f.commPerUnit,
      shipping: ship,
      delivery: deliv,
      size: legacy.size,
      color: legacy.color,
      selectedVariants: buildSelectedVariantsPayload(p, selectedVariants),
      qty,
      total: p ? parseFloat((p.price * qty + ship + deliv).toFixed(2)) : 0,
      feePerUnit: f.feePerUnit,
      totalFee: f.totalFee,
      commPerUnit: f.commPerUnit,
      platformPerUnit: f.platformPerUnit,
      notes: notes.trim(),
      bizName: p ? p.biz : "",
      bizPhone: p ? p.bizPhone : "",
      hasReceipt,
      receiptUrl,
      depositConfirmed: status === "pending",
      payDate: status === "pending" ? today2() : null,
      _status: status,
      _isDraft: status === "draft" && !(existing && existing.dbId),
      adminNotes: (existing && existing.adminNotes) || "",
      receiptUploadedAt: hasReceipt ? (existing && existing.receiptUploadedAt) || new Date().toISOString() : null,
      reviewedAt: (existing && existing.reviewedAt) || null,
      _sym: p && p.currency ? p.currency.symbol : (existing && existing._sym) || "$",
      _curCode: p && p.currency ? p.currency.code : (existing && existing._curCode) || "USD",
      _createdAt: existing?._createdAt,
      _updatedAt: new Date(),
    };
  };

  // Keep a local draft in step with what has been typed, so a reload or an OS
  // tab-discard while the gallery picker is open doesn't lose the order.
  useEffect(() => {
    if (!open) return;
    const o = buildLocalOrder("draft");
    if (!o.customerName && !o.phone && !o.productKey && !o.hasReceipt && !o.notes) return;
    if (!editingId) setEditingId(o.id);
    upsertDraft(o, userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name, phone, whatsapp, productKey, selectedVariants, qty, countryCode, city, address, notes, hasReceipt, receiptUrl]);

  /* ── Handlers ── */

  const onPickProduct = (id: string) => {
    setProductKey(id);
    setSelectedVariants({});
    setQty(1);
    setCountryCode("");
    setCity("");
    setPickerOpen(false);
  };

  const changeQty = (d: number) => {
    const nq = Math.max(1, qty + d);
    const mx = maxQtyForSelection(currentProduct, selectedVariants);
    if (d > 0 && nq > mx) {
      alert(isAr() ? `الكميه اكثر من ${mx} غير متوفر` : `Quantity more than ${mx} unavailable`);
      return;
    }
    setQty(nq);
  };

  const uploadReceipt = () => {
    pickReceiptFile(async (file) => {
      setUpload({ status: "uploading", label: "Uploading " + file.name + "…" });
      if (!api.uploadReceipt) {
        setUpload({ status: "error", label: "Upload service not ready — refresh and try again" });
        setHasReceipt(false);
        setReceiptUrl("");
        return;
      }
      try {
        const url = await api.uploadReceipt(file);
        setReceiptUrl(url);
        setHasReceipt(true);
        setUpload({ status: "done", label: "✓ Receipt ready · " + file.name });
      } catch (e) {
        console.error("[Lateen] uploadReceipt", e);
        setUpload({ status: "error", label: "Upload failed — tap to try again (" + ((e as Error).message || e) + ")" });
        setHasReceipt(false);
        setReceiptUrl("");
      }
    });
  };

  const submitOrder = async () => {
    if (submitting) return;
    const rawPhone = phone.trim();
    const rawWa = whatsapp.trim();
    const sendNow = hasReceipt;
    const ar = isAr();

    if (sendNow && profile?.frozen_at) {
      alert(
        ar
          ? "تم تجميد حسابك من قبل الإدارة، ولا يمكنك إرسال طلبات جديدة حالياً."
          : "Your account has been frozen by the admin. You can't submit new orders right now.",
      );
      return;
    }

    if (sendNow) {
      if (!name.trim()) { alert(ar ? "يرجى إدخال اسم العميل" : "Please enter customer name."); return; }
      if (!PHONE_RE_LOCAL.test(rawPhone)) {
        alert(ar
          ? "رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094"
          : "Phone must be 10 digits and start with 091, 092, 093 or 094.");
        return;
      }
      if (currentProduct?.reqPhone && !rawWa) {
        alert(ar ? "يرجى إدخال رقم هاتف إضافي من الزبون" : "Please enter an additional phone number for the customer.");
        return;
      }
      if (rawWa && !PHONE_RE_LOCAL.test(rawWa)) {
        alert(ar
          ? "رقم واتساب يجب أن يكون 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094"
          : "WhatsApp must be 10 digits and start with 091, 092, 093 or 094.");
        return;
      }
      if (rawWa && rawWa === rawPhone && ccode === wcode) {
        alert(ar
          ? "رقم الهاتف الإضافي يجب ألا يكون نفس رقم الهاتف الأساسي"
          : "The additional phone number can't be the same as the main phone number.");
        return;
      }
      if (!productKey) { alert(ar ? "يرجى اختيار المنتج" : "Please select a product."); return; }
      if (!currentDelivery) { alert(ar ? "يرجى اختيار الدولة والمدينة" : "Please choose country and city."); return; }
      if (!address.trim()) { alert(ar ? "يرجى إدخال عنوان التوصيل" : "Please enter the delivery address."); return; }
    }

    const p = currentProduct;
    const localOrder = buildLocalOrder(sendNow ? "pending" : "draft");
    const existing = editingId ? orders.find((o) => o.id === editingId) : null;
    const existingDbId = existing ? existing.dbId : null;
    const legacy = syncLegacyVariants(selectedVariants);

    setSubmitting(true);
    try {
      if (p && p.bid && sendNow) {
        const persistedFields = {
          qty,
          unit_price: p.price,
          commission: localOrder.commPerUnit,
          platform_fee: localOrder.platformPerUnit,
          currency: p.currency || null,
          customer_name: name.trim(),
          customer_phone: localOrder.phone,
          customer_whatsapp: localOrder.whatsapp || null,
          customer_city: currentDelivery!.city,
          customer_country: currentDelivery!.country,
          customer_country_code: currentDelivery!.countryCode,
          customer_address: localOrder.address || null,
          customer_notes: localOrder.notes || null,
          shipping_fee: localOrder.shipping || 0,
          delivery_fee: localOrder.delivery || 0,
          size: legacy.size || null,
          color: legacy.color || null,
          selected_variants: buildSelectedVariantsPayload(p, selectedVariants),
          receipt_url: receiptUrl || null,
          marketer_confirmed_at: new Date().toISOString(),
          status: "pending",
          admin_notes: null,
        };
        if (existingDbId) {
          await api.updateOrder(existingDbId, persistedFields);
        } else {
          const created = await api.createOrder({ product_id: p.id, business_id: p.bid, ...persistedFields } as never);
          if (created && (created as { id?: string }).id) {
            localOrder.dbId = (created as { id: string }).id;
            localOrder._isDraft = false;
          }
        }
        removeDraft(localOrder.id, userId);
        if (editingId && editingId !== localOrder.id) removeDraft(editingId, userId);
      } else {
        upsertDraft(localOrder, userId);
      }
    } catch (e) {
      console.error("[Lateen] submitOrder", e);
      alert((isAr() ? "تعذّر حفظ الطلبية: " : "Could not save order: ") + ((e as Error).message || e));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);

    setOrders((prev) => {
      if (editingId) {
        const idx = prev.findIndex((o) => o.id === editingId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...localOrder, id: editingId };
          return next;
        }
      }
      return [localOrder, ...prev];
    });

    onClose();
    void refreshWalletAndPayout();
    if (sendNow) void reloadOrders();
    onSubmitted();
  };

  const t = pkT();
  const ar = isAr();
  const availableCountries = currentProduct ? Object.keys(currentProduct.delivery) : [];
  const zoneCities = currentProduct && countryCode ? currentProduct.delivery[countryCode]?.cities || [] : [];
  const noDelivery = !!(currentProduct && countryCode && !currentProduct.delivery[countryCode]);
  const submitLabel = hasReceipt && !needVariant
    ? "Send Order to Business Owner"
    : editingId
      ? "Save changes"
      : "Save order";

  return (
    <div className={"overlay" + (open ? " open" : "")} style={{ position: "fixed", inset: 0 }}>
      <div className="overlay-bg" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />

        <div className="ord-header-bar">
          <button type="button" className="ord-back" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="ord-title-wrap">
            <div className="ord-title" data-i18n="New order title">{editingId ? "Edit order" : "New order"}</div>
          </div>
        </div>

        {!!staleBanner && (
          <div
            style={{
              margin: "0 0 12px", padding: "10px 12px", borderRadius: 10,
              background: "rgba(234,179,8,0.10)", border: "0.5px solid rgba(234,179,8,0.35)",
              color: "#eab308", fontSize: 12, fontWeight: 600, lineHeight: 1.5,
            }}
          >
            {staleBanner}
          </div>
        )}

        {/* Card 1 — customer info */}
        <div className="ord-card">
          <div className="ord-num">1</div>
          <div className="ord-head">
            <span data-i18n="Customer info">Customer info</span>
            <span className="ord-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
          </div>

          <div className="field">
            <label>
              <span data-i18n="Full name">Full name</span> <span style={{ color: "#e07070" }}>*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Kim Kardashian" />
          </div>

          <div className="field" style={{ marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#7f77dd" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <span data-i18n="Phone number">Phone number</span>
              <span style={{ color: "#e07070" }}>*</span>
            </label>
          </div>
          <div className="field-row" style={{ gridTemplateColumns: "96px 1fr" }}>
            <div className="field">
              <select className="cc-select" dir="ltr" value={ccode} onChange={(e) => setCcode(e.target.value)}>
                <option value="+218">&#x200E;+218</option>
                <option value="" disabled className="opt-soon">— More — Soon</option>
              </select>
            </div>
            <div className="field">
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="091xxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>
          </div>

          <button
            type="button"
            className="wa-toggle"
            aria-expanded={waOpen}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (waRequired) return;
              setWaOpen((v) => !v);
            }}
          >
            <span style={{ color: "#25D366" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.6A11.9 11.9 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5zM12 22c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.5 15.8 2 13.9 2 12 2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" />
              </svg>
            </span>
            <span data-i18n="WhatsApp or additional phone number">WhatsApp or additional phone number</span>
            {!waRequired && <span data-i18n="(optional)">(optional)</span>}
            {waRequired && <span style={{ color: "#e07070" }}>*</span>}
            {!waRequired && (
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: "transform .2s", transform: waOpen ? "rotate(180deg)" : undefined }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>
          <div className={"wa-section" + (waOpen ? " open" : "")} aria-hidden={!waOpen}>
            <div className="field-row" style={{ margin: "10px 0 14px", gridTemplateColumns: "96px 1fr" }}>
              <div className="field">
                <select className="cc-select" dir="ltr" value={wcode} onChange={(e) => setWcode(e.target.value)}>
                  <option value="+218">&#x200E;+218</option>
                  <option value="" disabled className="opt-soon">— More — Soon</option>
                </select>
              </div>
              <div className="field">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="091xxxxxxx"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
              <span>{t.fieldLabel}</span> <span style={{ color: "#e07070" }}>*</span>
              <span style={{ color: "#7f77dd" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7 12 3 4 7l8 4 8-4z" />
                  <path d="M4 7v10l8 4 8-4V7" />
                </svg>
              </span>
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{
                width: "100%", textAlign: "left", background: "#2a2a2a", border: "0.5px solid #3a3a3a",
                borderRadius: 10, padding: "10px 12px", color: "var(--color-text-primary)", fontSize: 13,
                fontFamily: "var(--font-sans)", cursor: "pointer", display: "flex", alignItems: "center",
                gap: 10, minHeight: 48,
              }}
            >
              <div
                style={{
                  width: 34, height: 34, borderRadius: 8, background: "#1a1a1a", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 18, overflow: "hidden", flexShrink: 0,
                }}
              >
                📦
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: currentProduct ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  }}
                >
                  {currentProduct ? currentProduct.name : t.sel}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {vgList.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {vgList.map((g, i) => {
                const hasPh = g.items.some((x) => x.photo);
                return (
                  <div className="pd-variant" style={{ margin: "0 0 8px" }} key={g.name + i}>
                    <div className="pd-variant-lbl" data-no-i18n>
                      {(g.name || "").replace(/[<>]/g, "")} <span style={{ color: "#e07070" }}>*</span>
                    </div>
                    <div className="pd-variant-sel-wrap">
                      <select
                        className="pd-variant-sel"
                        data-no-i18n
                        value={selectedVariants[g.name] || ""}
                        onChange={(e) => setSelectedVariants((prev) => ({ ...prev, [g.name]: e.target.value }))}
                      >
                        <option value="">{(ar ? "اختر" : "Select") + " " + (g.name || "").replace(/[<>]/g, "")}</option>
                        {g.items.map((x) => {
                          const q = typeof x.qty === "number" && Number.isFinite(x.qty) ? x.qty : null;
                          const oos = q === 0;
                          return (
                            <option key={x.val} value={x.val} disabled={oos}>
                              {x.val}
                              {oos ? ` · ${ar ? "غير متوفر" : "out of stock"}` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <svg className="pd-variant-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    {hasPh && (
                      <div className="pd-variant-thumbs">
                        {g.items.map((x, ii) => {
                          if (!x.photo) return null;
                          const q = typeof x.qty === "number" && Number.isFinite(x.qty) ? x.qty : null;
                          const oos = q === 0;
                          return (
                            <div
                              key={x.val + ii}
                              className={"pd-vth" + (oos ? " oos" : "") + (selectedVariants[g.name] === x.val ? " on" : "")}
                              onClick={
                                oos
                                  ? undefined
                                  : (e) => {
                                      e.stopPropagation();
                                      setSelectedVariants((prev) => ({ ...prev, [g.name]: x.val }));
                                      lightbox.openOne(x.photo);
                                    }
                              }
                            >
                              <img src={x.photo} alt="" />
                              <div className="pd-vth-lbl" data-no-i18n>{x.val}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!!currentProduct && !needVariant && (
            <div className="qty-row" style={{ display: "flex", marginTop: 12 }}>
              <span className="qty-label" data-i18n="Quantity">Quantity</span>
              <div className="qty-controls">
                <button className="qty-btn" onClick={() => changeQty(-1)}>−</button>
                <div className="qty-display">{qty}</div>
                <button className="qty-btn" onClick={() => changeQty(1)}>+</button>
              </div>
            </div>
          )}
        </div>

        {/* Card 2 — delivery address */}
        {!!currentProduct && (
          <div className="ord-card">
            <div className="ord-num">2</div>
            <div className="ord-head">
              <span data-i18n="Delivery address">Delivery address</span>
              <span className="ord-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
            </div>
            <div className="field-row">
              <div className="field">
                <label>
                  <span data-i18n="Country">Country</span> <span style={{ color: "#e07070" }}>*</span>
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => { setCountryCode(e.target.value); setCity(""); }}
                >
                  <option value="">— Select country —</option>
                  {availableCountries.map((code) => (
                    <option key={code} value={code}>{COUNTRY_NAMES[code] || code}</option>
                  ))}
                </select>
                <div className="field-hint">{availableCountries.length + " countries available for this product"}</div>
              </div>
              <div className="field">
                <label>
                  <span data-i18n="City">City</span> <span style={{ color: "#e07070" }}>*</span>
                </label>
                <select value={city} onChange={(e) => setCity(e.target.value)} disabled={!countryCode || noDelivery}>
                  <option value="">{countryCode ? "— Select city —" : "— Select country first —"}</option>
                  {zoneCities.map((c) => (
                    <option key={c} value={c}>{cityLabel(c)}</option>
                  ))}
                </select>
                <div className="field-hint">{countryCode && !noDelivery ? zoneCities.length + " cities available" : ""}</div>
              </div>
            </div>

            {noDelivery && (
              <div className="no-delivery-note" style={{ display: "block" }}>
                {ar
                  ? "هذا المنتج غير متوفر للتوصيل إلى " + (COUNTRY_NAMES[countryCode] || countryCode) + ". يرجى اختيار دولة أخرى."
                  : "This product is not available for delivery to " + (COUNTRY_NAMES[countryCode] || countryCode) + ". Please choose a different country."}
              </div>
            )}

            {!!currentDelivery && (
              <div className="field" style={{ display: "block", marginTop: 13 }}>
                <label>
                  <span data-i18n="Address description">Address description</span> <span style={{ color: "#e07070" }}>*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, area, landmark, house number…"
                />
              </div>
            )}

            <div className="field" style={{ marginTop: 13, marginBottom: 0 }}>
              <label data-i18n="Notes (optional)">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions, preferred delivery time, etc."
              />
            </div>
          </div>
        )}

        {/* Card 3 — summary */}
        {!!currentProduct && (
          <div className="ord-card">
            <div className="ord-head">
              <span data-i18n="Order summary">Order summary</span>
              <span className="ord-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="15" y2="17" />
                </svg>
              </span>
            </div>
            <div className="ord-summary-row">
              <span>
                {ar
                  ? "سعر المنتج (" + (qty === 1 ? "قطعة واحدة" : qty === 2 ? "قطعتين" : qty + " قطع") + ")"
                  : "Product price (" + (qty === 1 ? "1 pc" : qty + " pcs") + ")"}
              </span>
              <span className="v"><Money n={subtotal} sym={sym} code={curCode} /></span>
            </div>
            <div className="ord-summary-row">
              <span data-i18n="Shipping">Shipping</span>
              <span className="v"><FreeOrMoney n={ship} sym={sym} code={curCode} free={!!currentDelivery} /></span>
            </div>
            <div className="ord-summary-row">
              <span data-i18n="Delivery fee">Delivery fee</span>
              <span className="v"><FreeOrMoney n={deliv} sym={sym} code={curCode} free={!!currentDelivery} /></span>
            </div>
            <div className="ord-summary-total">
              <span data-i18n="Total">Total</span>
              <span className="v"><Money n={total} sym={sym} code={curCode} /></span>
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4, textAlign: "end" }} data-no-i18n>
              <span>{codParts.label}</span> <Money n={codPays} sym={sym} code={curCode} />
              <span>{codParts.suffix}</span>
            </div>
          </div>
        )}

        {/* Fee / deposit card */}
        {!!currentProduct && fee && (
          <div className="auto-card fee-card-dark" style={{ display: "block" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 6, letterSpacing: "0.2px" }} data-i18n="Mandatory Upfront Deposit">
              Mandatory Upfront Deposit
            </div>
            <div
              style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14, lineHeight: 1.5 }}
              data-i18n="An upfront payment is required before this order can be processed."
            >
              An upfront payment is required before this order can be processed.
            </div>
            <div className="ac-row" style={{ marginBottom: 10, alignItems: "center" }}>
              <span className="ac-label" style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.55 }}>
                <span data-i18n="Your Marketer Fee">Your Marketer Fee</span> (
                <span data-no-i18n>{pctTxt(currentProduct.pct * 100)}%</span>):
              </span>
              <span className="ac-value" style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
                <Money n={commAmt} sym={sym} code={curCode} />
              </span>
            </div>
            <div className="ac-row" style={{ marginBottom: 12, alignItems: "center" }}>
              <span className="ac-label" style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.55 }}>
                <span data-i18n="Platform Security Fee">Platform Security Fee</span>
                <span data-no-i18n>{platFixed ? "" : ` (${platPct}%)`}</span>:
              </span>
              <span className="ac-value" style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
                <Money n={platAmt} sym={sym} code={curCode} />
              </span>
            </div>
            <div className="fee-divider" />
            <div className="ac-row" style={{ marginBottom: 12 }}>
              <span className="ac-label" style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                <span data-i18n="Total fee required">Total fee required</span>
              </span>
              <span className="ac-value" style={{ color: "#fff", fontSize: 20, fontWeight: 600 }}>
                <Money n={fee.totalFee} sym={sym} code={curCode} />
              </span>
            </div>
            <div className="fee-divider" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() =>
                    onOpenDepositInfo({
                      pays: codPays, sym: sym || "$", code: curCode || "", delivery: deliv, shipping: ship,
                    })
                  }
                  style={{
                    background: "rgba(224,112,112,0.15)", border: "0.5px solid rgba(224,112,112,0.4)",
                    borderRadius: 8, padding: "3px 6px", cursor: "pointer", display: "inline-flex", alignItems: "center",
                  }}
                  aria-label="Important info about upfront deposit"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e07070" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </button>
                <span data-i18n="Payment receipt">Payment receipt</span> <span style={{ color: "#e07070" }}>*</span>
              </div>
              <button
                type="button"
                onClick={onOpenPayDetails}
                style={{
                  background: "#2a2a2a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: 11,
                  fontWeight: 500, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <span data-i18n="Payment details">Payment details</span>
              </button>
            </div>
            <label
              className={
                "upload-box dashed-lg" +
                (upload.status === "done" ? " has-file" : "") +
                (upload.status === "uploading" ? " uploading" : "") +
                (upload.status === "error" ? " error" : "")
              }
              onClick={uploadReceipt}
              style={{ marginBottom: 0 }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7f77dd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div
                className={
                  "upload-icon-label" +
                  (upload.status === "done" ? " done" : "") +
                  (upload.status === "error" ? " err" : "")
                }
              >
                {upload.status === "uploading" && <span className="upload-spinner" />}
                {upload.label}
              </div>
            </label>
          </div>
        )}

        <button
          className="submit-btn primary"
          onClick={() => void submitOrder()}
          disabled={needVariant || submitting}
          title={
            needVariant
              ? ar
                ? "يرجى اختيار خيار المنتج للمتابعة"
                : "Please choose the product variant to continue"
              : hasReceipt
                ? "Receipt will go to admin for verification, then forwarded to the business owner."
                : "Saved locally. Upload a receipt to send for verification."
          }
          style={{
            opacity: needVariant ? 0.5 : 1,
            cursor: needVariant ? "not-allowed" : "pointer",
            ...(hasReceipt && !needVariant ? { background: "#2dbd8f", color: "#fff" } : null),
          }}
        >
          <span className="spark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </span>
          <span data-i18n={submitLabel}>{submitLabel}</span>
        </button>
        <button className="cancel-btn" onClick={onClose} data-i18n="Cancel">Cancel</button>
      </div>

      <ProductPickerOverlay open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPickProduct} />
    </div>
  );
}
