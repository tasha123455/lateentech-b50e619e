import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Ctx = { open: (url: string, caption?: ReactNode) => void; close: () => void };

const LightboxCtx = createContext<Ctx | null>(null);

export function useLightbox(): Ctx {
  const v = useContext(LightboxCtx);
  if (!v) throw new Error("useLightbox must be used inside LightboxProvider");
  return v;
}

/** Fullscreen receipt/photo viewer. Clicking the backdrop closes it. */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState("");
  // Anything the opener wants pinned in the corner of the fullscreen view —
  // the receipt viewer puts its timestamps there.
  const [caption, setCaption] = useState<ReactNode>(null);
  const open = useCallback((u: string, cap?: ReactNode) => { setUrl(u || ""); setCaption(cap ?? null); }, []);
  const close = useCallback(() => { setUrl(""); setCaption(null); }, []);

  return (
    <LightboxCtx.Provider value={{ open, close }}>
      {children}
      <div className={"adm-lightbox" + (url ? " open" : "")} onClick={close}>
        <button
          type="button"
          className="adm-lightbox-close"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); close(); }}
        >
          ×
        </button>
        {!!url && <img src={url} alt="Receipt" />}
        {!!url && !!caption && (
          <div className="adm-lightbox-caption" onClick={(e) => e.stopPropagation()}>{caption}</div>
        )}
      </div>
    </LightboxCtx.Provider>
  );
}
