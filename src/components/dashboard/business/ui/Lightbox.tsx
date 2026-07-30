import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LightboxCtx = { open: (photos: string[], idx?: number) => void; close: () => void };

const Ctx = createContext<LightboxCtx | null>(null);

export function useLightbox(): LightboxCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLightbox must be used inside LightboxProvider");
  return v;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const touch = useRef<{ x: number; y: number; dragging: boolean }>({ x: 0, y: 0, dragging: false });

  const open = useCallback((list: string[], i?: number) => {
    const ph = (list || []).filter(Boolean);
    if (!ph.length) return;
    setPhotos(ph);
    setIdx(Math.min(Math.max(i || 0, 0), ph.length - 1));
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const go = (delta: number) => setIdx((i) => Math.min(Math.max(i + delta, 0), photos.length - 1));

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <div
        className={"mp-lightbox-overlay" + (isOpen ? " open" : "")}
        id="mp-lightbox-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <div
          className="mp-lightbox-stage"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="mp-lightbox-track"
            id="mp-lightbox-track"
            onTouchStart={(e) => {
              touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dragging: true };
            }}
            onTouchEnd={(e) => {
              if (!touch.current.dragging) return;
              touch.current.dragging = false;
              const dx = e.changedTouches[0].clientX - touch.current.x;
              const dy = e.changedTouches[0].clientY - touch.current.y;
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
          >
            {photos.map((u, i) => (
              <div
                key={u + i}
                className={"mp-lightbox-slide" + (i === idx ? " active" : "")}
                style={{ transform: `translateX(${(i - idx) * 100}%)` }}
              >
                <img src={u} alt="" />
              </div>
            ))}
          </div>
          <div className="mp-lightbox-nav" id="mp-lightbox-nav" style={{ display: photos.length > 1 ? "flex" : "none" }}>
            <button className="mp-lightbox-arrow" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous">‹</button>
            <button className="mp-lightbox-arrow" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next">›</button>
          </div>
          <div className="mp-lightbox-dots" id="mp-lightbox-dots">
            {photos.length > 1
              ? photos.map((_, i) => (
                  <span
                    key={i}
                    className={"mp-lightbox-dot" + (i === idx ? " active" : "")}
                    onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                  />
                ))
              : null}
          </div>
        </div>
        <div className="mp-lightbox-close" onClick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      </div>
    </Ctx.Provider>
  );
}
