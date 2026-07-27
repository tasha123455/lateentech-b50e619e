// Wasla brand mark / wordmark. Component name kept as `LateenLogo` to avoid
// churning many import sites — the visual is the Wasla brand.
type Props = {
  size?: number;
  variant?: "mark" | "wordmark";
  lang?: "en" | "ar";
};

export function LateenLogo({ size = 68, variant = "mark", lang = "en" }: Props) {
  if (variant === "wordmark") {
    // Wordmark PNGs already contain the arrow mark + typeset name + tagline
    // in the exact brand font. `size` here means the rendered height.
    const src = lang === "ar" ? "/wasla-wordmark-ar.png" : "/wasla-wordmark-en.png";
    // Preserve aspect ratio from source assets (EN 1787x880, AR 1535x1024).
    const ratio = lang === "ar" ? 1535 / 1024 : 1787 / 880;
    return (
      <img
        src={src}
        height={size}
        width={Math.round(size * ratio)}
        alt="Wasla"
        style={{ display: "block", height: size, width: "auto", maxWidth: "100%" }}
      />
    );
  }
  return (
    <img
      src="/wasla-mark-192.png"
      width={size}
      height={size}
      alt="Wasla"
      style={{ display: "block", borderRadius: size >= 40 ? 14 : 8 }}
    />
  );
}
