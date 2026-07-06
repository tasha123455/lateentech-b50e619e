import { useRef } from "react";

/**
 * Renders /public/my-products.html (uploaded as-is, untouched) inside the
 * business "Products" tab. The file is a fully self-contained page (its own
 * markup, CSS and JS), so it's loaded in an iframe rather than ported into
 * JSX — this guarantees the layout, buttons and behavior are byte-for-byte
 * identical to the file that was provided.
 */
export function ProductsPageEmbed() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const resize = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentWindow?.document;
    if (!iframe || !doc) return;

    const setHeight = () => {
      const h = doc.documentElement.scrollHeight;
      iframe.style.height = `${h}px`;
    };
    setHeight();

    // Keep resizing as cards expand/collapse, photos change, folds open, etc.
    const ro = new ResizeObserver(setHeight);
    ro.observe(doc.body);
  };

  return (
    <iframe
      ref={iframeRef}
      src="/my-products.html"
      title="My products"
      onLoad={resize}
      style={{ width: "100%", border: "none", display: "block", overflow: "hidden" }}
      scrolling="no"
    />
  );
}
