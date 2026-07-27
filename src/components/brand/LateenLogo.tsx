// Wasla brand mark / wordmark / full lockup.
type Props = {
  size?: number;
  variant?: "mark" | "wordmark";
  lang?: "en" | "ar";
  showTagline?: boolean;
};

export function LateenLogo({ size = 68, variant = "mark", lang = "en", showTagline = true }: Props) {
  if (variant === "wordmark") {
    // Full lockup: mark on top, wordmark below, tagline under it — matches the
    // brand reference. `size` = height of the mark; wordmark/tagline scale
    // proportionally so it reads like one composed piece.
    const wordSrc = lang === "ar" ? "/wasla-wordmark-ar.png" : "/wasla-wordmark-en.png";
    const tagSrc = lang === "ar" ? "/wasla-tagline-ar.png" : "/wasla-tagline-en.png";
    const markH = size;
    const wordH = Math.round(size * 0.72);
    const tagH = Math.round(size * 0.13);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: Math.round(size * 0.08),
          maxWidth: "100%",
        }}
      >
        <img
          src="/wasla-mark.png"
          alt=""
          aria-hidden
          style={{ height: markH, width: "auto", display: "block" }}
        />
        <img
          src={wordSrc}
          alt="Wasla"
          style={{ height: wordH, width: "auto", display: "block", maxWidth: "100%" }}
        />
        {showTagline && (
          <img
            src={tagSrc}
            alt=""
            aria-hidden
            style={{
              height: tagH,
              width: "auto",
              display: "block",
              maxWidth: "100%",
              marginTop: Math.round(size * 0.06),
            }}
          />
        )}
      </div>
    );
  }
  return (
    <img
      src="/wasla-mark.png"
      width={size}
      height={size}
      alt="Wasla"
      style={{ display: "block", height: size, width: "auto" }}
    />
  );
}
