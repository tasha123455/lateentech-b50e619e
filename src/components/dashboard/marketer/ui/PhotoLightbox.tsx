import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { PhotoDownloadButton } from "@/components/shared/PhotoDownloadButton";

type Ctx = {
  /** Opens the fullscreen viewer on `photos`, starting at `idx`. */
  open: (photos: string[], idx?: number) => void;
  openOne: (url: string) => void;
  close: () => void;
  isOpen: boolean;
};

const LightboxCtx = createContext<Ctx | null>(null);

export function usePhotoLightbox(): Ctx {
  const v = useContext(LightboxCtx);
  if (!v) throw new Error("usePhotoLightbox must be used inside PhotoLightboxProvider");
  return v;
}

export function PhotoLightboxProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

  const open = useCallback((list: string[], start = 0) => {
    const clean = (list || []).filter(Boolean);
    if (!clean.length) return;
    setPhotos(clean);
    setIdx(Math.max(0, Math.min(start, clean.length - 1)));
  }, []);

  const openOne = useCallback((url: string) => {
    if (!url) return;
    setPhotos([url]);
    setIdx(0);
  }, []);

  const close = useCallback(() => setPhotos([]), []);

  const isOpen = photos.length > 0;

  // The viewer is fullscreen, so the page behind it must not scroll.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  return (
    <LightboxCtx.Provider value={{ open, openOne, close, isOpen }}>
      {children}
      {isOpen && (
        <Viewer
          photos={photos}
          idx={idx}
          onIdx={setIdx}
          onClose={close}
        />
      )}
    </LightboxCtx.Provider>
  );
}

function Viewer({
  photos, idx, onIdx, onClose,
}: {
  photos: string[];
  idx: number;
  onIdx: (i: number) => void;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Horizontal swipe pages the viewer; a vertical drag is left to the browser.
  useEffect(() => {
    const tr = trackRef.current;
    if (!tr) return;
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
        if (dx < 0) onIdx(Math.min(idx + 1, photos.length - 1));
        else onIdx(Math.max(idx - 1, 0));
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
  }, [idx, photos.length, onIdx]);

  return (
    <div
      id="photoLB"
      style={{
        display: "flex", position: "fixed", inset: 0, zIndex: 1100, background: "#000",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute", top: "calc(14px + env(safe-area-inset-top,0px))", right: 14,
          width: 48, height: 48, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.55)",
          background: "rgba(0,0,0,.62)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 28,
          lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 2147483000, boxShadow: "0 4px 16px rgba(0,0,0,.6)",
        }}
      >
        ×
      </button>
      {/* Beside the close button, on the same side it is pinned to. */}
      <PhotoDownloadButton
        url={photos[idx] || ""}
        style={{ top: "calc(14px + env(safe-area-inset-top,0px))", insetInlineEnd: "auto", right: 72 }}
      />
      <div ref={trackRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", touchAction: "pan-y" }}>
        {photos.map((u, i) => (
          <div
            key={u + i}
            className="pd-lb-img"
            style={{ transform: `translateX(${(i - idx) * 100}%)` }}
          >
            <img src={u} alt="" />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", gap: 6, justifyContent: "center", zIndex: 2 }}>
        {photos.length > 1 &&
          photos.map((_, i) => (
            <span
              key={i}
              className={"pd-lb-dot" + (i === idx ? " on" : "")}
              onClick={() => onIdx(i)}
            />
          ))}
      </div>
    </div>
  );
}
