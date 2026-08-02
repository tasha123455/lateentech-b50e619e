import { useEffect, useRef, useState } from "react";

import { pickFile } from "@/lib/filePicker";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr } from "../lib/format";
import type { ProductReview } from "../lib/types";
import { usePhotoLightbox } from "../ui/PhotoLightbox";
import { pdT } from "./pdText";

export function ReviewsSection({
  productId, reviews, onReload, onReport,
}: {
  productId: string;
  reviews: ProductReview[];
  onReload: () => void;
  onReport: () => void;
}) {
  const lightbox = usePhotoLightbox();
  return (
    <>
      <ReviewsList
        reviews={reviews}
        onPhoto={(u) => lightbox.openOne(u)}
        trailing={<ReportButton onClick={onReport} />}
      />
      <ReviewForm productId={productId} onSubmitted={onReload} />
    </>
  );
}

/** The read-only half: the heading with the average, and the review carousel.
 *
 *  The admin's product sheet renders this on its own — an admin has no review
 *  to write and nobody to report a product to, so the form and the report
 *  button stay behind ReviewsSection. */
export function ReviewsList({
  reviews, onPhoto, trailing,
}: {
  reviews: ProductReview[];
  onPhoto: (url: string) => void;
  /** Extra control in the section title, e.g. the marketer's Report button. */
  trailing?: React.ReactNode;
}) {
  const t = pdT();
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const n = reviews.length;
  useEffect(() => { setIdx((i) => Math.min(i, Math.max(0, n - 1))); }, [n]);

  // Horizontal swipe pages the carousel; vertical drags scroll the sheet.
  useEffect(() => {
    const tr = trackRef.current;
    if (!tr || n <= 1) return;
    let sx = 0;
    let sy = 0;
    let act = false;
    let decided = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      act = true;
      decided = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!act || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (!decided) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) decided = 1;
        else if (Math.abs(dy) > 10) { decided = 2; act = false; }
      }
      if (decided === 1) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      if (!act) return;
      act = false;
      const dx = (e.changedTouches[0] || ({} as Touch)).clientX - sx;
      if (Math.abs(dx) > 50) {
        if (dx < 0) setIdx((i) => Math.min(i + 1, n - 1));
        else setIdx((i) => Math.max(i - 1, 0));
      }
    };

    tr.addEventListener("touchstart", onStart, { passive: true });
    tr.addEventListener("touchmove", onMove, { passive: false });
    tr.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      tr.removeEventListener("touchstart", onStart);
      tr.removeEventListener("touchmove", onMove);
      tr.removeEventListener("touchend", onEnd);
    };
  }, [n]);

  const avg = n ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / n : 0;
  const rd = Math.round(avg);

  const item = (r: ProductReview) => {
    const d = new Date(r.ts);
    const ds = d.toLocaleDateString(isAr() ? "ar-LY" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    const stars = "★★★★★".slice(0, r.rating) + "☆☆☆☆☆".slice(0, 5 - r.rating);
    const initials = (r.author || t.anon || "M").trim().charAt(0).toUpperCase();
    return (
      <div className="pd-rev-item">
        <div className="pd-rev-head">
          <div className="pd-rev-author" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {r.avatar ? (
              <img
                src={r.avatar}
                alt=""
                style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <span
                style={{
                  width: 22, height: 22, borderRadius: "50%", background: "var(--color-background-tertiary)",
                  color: "var(--color-text-secondary)", fontSize: 10, fontWeight: 600, display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {initials}
              </span>
            )}
            <span {...(r.author ? { "data-no-i18n": "" } : {})}>{r.author || t.anon}</span>
          </div>
          <div className="pd-rev-date">{ds}</div>
        </div>
        <div className="pd-rev-stars">{stars}</div>
        <div className="pd-rev-text" data-no-i18n>{r.text}</div>
        {!!r.photo && (
          <div style={{ marginTop: 8 }}>
            <img
              src={r.photo}
              alt=""
              onClick={() => onPhoto(r.photo)}
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "pointer", display: "block" }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className="pd-sec-ttl"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>{`${t.reviews} (${n})`}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {n > 0 && (
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 400 }}>
              <span style={{ color: "#e9b949", letterSpacing: 2 }}>{"★".repeat(rd) + "☆".repeat(5 - rd)}</span>{" "}
              <span style={{ margin: "0 4px" }}>{avg.toFixed(1)}</span>
            </span>
          )}
          {trailing}
        </span>
      </div>

      {!n ? (
        <div className="pd-rev-empty">{t.noRev}</div>
      ) : n === 1 ? (
        <div className="pd-rev-list" style={{ padding: "0 16px" }}>{item(reviews[0])}</div>
      ) : (
        <div className="pd-rev-car">
          <div
            className="pd-rev-track"
            ref={trackRef}
            style={{ transform: `translateX(${(isAr() ? 1 : -1) * idx * 100}%)` }}
          >
            {reviews.map((r) => (
              <div className="pd-rev-slide" key={r.id}>{item(r)}</div>
            ))}
          </div>
          <div className="pd-rev-dots">
            {reviews.map((r, i) => (
              <span key={r.id} className={"pd-rev-dot" + (i === idx ? " on" : "")} onClick={() => setIdx(i)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** The parent sheet owns the modal; this is only the trigger. */
function ReportButton({ onClick }: { onClick: () => void }) {
  const t = pdT();
  return (
    <button
      type="button"
      className="pd-report-btn"
      onClick={onClick}
      style={{
        background: "var(--color-background-secondary)", color: "var(--color-text-primary)",
        border: "0.5px solid var(--color-border-secondary)", borderRadius: 999, fontSize: 12,
        fontWeight: 600, padding: "6px 14px", cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap",
      }}
    >
      {t.reportBtn}
    </button>
  );
}

function ReviewForm({ productId, onSubmitted }: { productId: string; onSubmitted: () => void }) {
  const { api } = useMarketerData();
  const t = pdT();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [hint, setHint] = useState("");
  const [sending, setSending] = useState(false);
  const lightbox = usePhotoLightbox();

  // A fresh product resets the form.
  useEffect(() => {
    setRating(0);
    setText("");
    setPhoto("");
    setHint("");
  }, [productId]);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type) || f.size > 5 * 1024 * 1024) {
      alert(t.photoErr);
      return;
    }
    setHint(t.uploadingPhoto);
    try {
      if (!api.uploadReviewPhoto) throw new Error("no api");
      const url = await api.uploadReviewPhoto(f);
      setPhoto(url);
      setHint("");
    } catch (e) {
      console.error("[Lateen] pickRevPhoto", e);
      alert(t.photoErr);
      setHint(t.addPhoto);
    }
  };

  const submit = async () => {
    if (!rating) {
      alert(isAr() ? "اختر تقييماً من 1 إلى 5" : "Pick a rating from 1 to 5");
      return;
    }
    setSending(true);
    try {
      if (!api.upsertProductReview) throw new Error("no api");
      await api.upsertProductReview(productId, rating, text.trim(), photo || "");
      // Best-effort: notify the business owner, with the reviewer's avatar.
      try {
        let myAvatar = "";
        try {
          if (api.getProfile) {
            const prof = (await api.getProfile()) as { avatar_signed_url?: string };
            myAvatar = (prof && prof.avatar_signed_url) || "";
          }
        } catch { /* ignore */ }
        if (api.notifyProductReview) {
          await api.notifyProductReview(productId, rating, text.trim(), photo || "", myAvatar || "");
        }
      } catch (e) {
        console.error("[Lateen] notifyProductReview", e);
      }
      setText("");
      setRating(0);
      setPhoto("");
      setHint("");
      onSubmitted();
    } catch (e) {
      console.error("[Lateen] submitReview", e);
      alert(isAr() ? "تعذر إرسال التقييم" : "Could not submit review");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pd-rev-form">
      <div className="pd-rev-stars-pick">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={"pd-rev-star" + (i <= rating ? " on" : "")} onClick={() => setRating(i)}>
            ★
          </span>
        ))}
      </div>
      <textarea
        className="pd-rev-input"
        placeholder={t.revPh}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
        {!photo ? (
          <div
            onClick={() => pickFile({ onFiles: (files) => void pickPhoto(files[0]) })}
            style={{
              width: 44, height: 44, borderRadius: 10, border: "1px dashed var(--color-border-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: "var(--color-text-secondary)", flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        ) : (
          <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
            <img
              src={photo}
              onClick={() => lightbox.openOne(photo)}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10, cursor: "pointer", display: "block" }}
              alt=""
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPhoto(""); }}
              style={{
                position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                background: "#000", color: "#fff", border: "none", fontSize: 12, lineHeight: 1,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
        <span style={{ fontSize: 11.5, color: "var(--color-text-tertiary)" }}>{hint || (photo ? "" : t.addPhoto)}</span>
      </div>
      <button className="pd-rev-submit" disabled={sending} onClick={() => void submit()}>
        {sending ? (isAr() ? "جارِ الإرسال…" : "Sending…") : t.revBtn}
      </button>
    </div>
  );
}
