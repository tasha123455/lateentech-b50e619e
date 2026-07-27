// Wasla brand mark / wordmark / full lockup.
type Props = {
  size?: number;
  variant?: "mark" | "wordmark";
  lang?: "en" | "ar";
  showTagline?: boolean;
  glow?: boolean;
};

export function LateenLogo({
  size = 68,
  variant = "mark",
  lang = "en",
  showTagline = true,
  glow = false,
}: Props) {
  if (variant === "wordmark") {
    const wordSrc = lang === "ar" ? "/wasla-wordmark-ar.png" : "/wasla-wordmark-en.png";
    const tagSrc = lang === "ar" ? "/wasla-tagline-ar.png" : "/wasla-tagline-en.png";
    const markH = size;
    const wordH = lang === "ar" ? Math.round(size * 0.78) : Math.round(size * 1.05);
    const tagH = lang === "ar" ? Math.round(size * 0.11) : Math.round(size * 0.09);
    return (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: Math.round(size * 0.02),
          maxWidth: "100%",
          isolation: "isolate",
        }}
      >
        {glow && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: `-${Math.round(size * 0.9)}px -${Math.round(size * 1.4)}px`,
              zIndex: -1,
              pointerEvents: "none",
              background:
                "radial-gradient(closest-side at 22% 45%, rgba(232,32,86,0.35), transparent 70%), radial-gradient(closest-side at 50% 30%, rgba(180,45,220,0.32), transparent 70%), radial-gradient(closest-side at 80% 55%, rgba(46,196,120,0.30), transparent 70%)",
              filter: "blur(28px)",
            }}
          />
        )}
        <img
          src="/wasla-mark.png"
          alt=""
          aria-hidden
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          style={{ height: markH, width: "auto", display: "block" }}
        />
        <img
          src={wordSrc}
          alt="Wasla"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          style={{ height: wordH, width: "auto", display: "block", maxWidth: "100%", marginTop: -Math.round(size * 0.05) }}
        />
        {showTagline && (
          <img
            src={tagSrc}
            alt=""
            aria-hidden
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            style={{
              height: tagH,
              width: "auto",
              display: "block",
              maxWidth: "100%",
              marginTop: Math.round(size * 0.12),
              opacity: 0.85,
            }}
          />
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        isolation: "isolate",
      }}
    >
      {glow && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: `-${Math.round(size * 0.9)}px`,
            zIndex: -1,
            pointerEvents: "none",
            background:
              "radial-gradient(closest-side at 22% 45%, rgba(232,32,86,0.35), transparent 70%), radial-gradient(closest-side at 50% 30%, rgba(180,45,220,0.32), transparent 70%), radial-gradient(closest-side at 80% 55%, rgba(46,196,120,0.30), transparent 70%)",
            filter: "blur(28px)",
          }}
        />
      )}
      <img
        src="/wasla-mark.png"
        width={size}
        height={size}
        alt="Wasla"
        style={{ display: "block", height: size, width: "auto" }}
      />
    </div>
  );
}
