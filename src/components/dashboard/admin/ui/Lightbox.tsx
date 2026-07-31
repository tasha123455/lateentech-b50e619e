import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Ctx = { open: (url: string) => void; close: () => void };

const LightboxCtx = createContext<Ctx | null>(null);

export function useLightbox(): Ctx {
  const v = useContext(LightboxCtx);
  if (!v) throw new Error("useLightbox must be used inside LightboxProvider");
  return v;
}

/** Fullscreen receipt/photo viewer. Clicking the backdrop closes it. */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState("");
  const open = useCallback((u: string) => setUrl(u || ""), []);
  const close = useCallback(() => setUrl(""), []);

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
      </div>
    </LightboxCtx.Provider>
  );
}
