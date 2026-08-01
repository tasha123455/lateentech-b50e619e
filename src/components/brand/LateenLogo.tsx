// Wasla brand mark / wordmark lockup.
import { MARK, TAGLINE_AR, TAGLINE_EN, WORDMARK_AR, WORDMARK_EN, type BrandArt } from "./brandArt";

type Props = {
  size?: number;
  variant?: "mark" | "wordmark";
  lang?: "en" | "ar";
  showTagline?: boolean;
  glow?: boolean;
};

/* Proportions of the lockup, expressed against `size`.
 *
 * The art used to be padded, and the layout leaned on that padding — heights
 * were set on the whole canvas and negative margins pulled the empty parts back
 * together. Now the files are trimmed, so the spacing has to be stated instead
 * of inherited. These numbers are the old geometry measured off the untrimmed
 * canvases, so the lockup lands exactly where it always did — the art inside it
 * is simply bigger and sharper for the same `size`. */
const MARK_H = 0.80282;          // mark height
const WORD_H = { en: 0.37979, ar: 0.33745 };   // wordmark height
const TAG_H = { en: 0.09, ar: 0.11 };          // tagline height
const MARK_TO_WORD = { en: 0.37958, ar: 0.31862 };
const WORD_TO_TAG = { en: 0.50862, ar: 0.34192 };

const GLOW =
  "radial-gradient(closest-side at 22% 45%, rgba(232,32,86,0.35), transparent 70%), " +
  "radial-gradient(closest-side at 50% 30%, rgba(180,45,220,0.32), transparent 70%), " +
  "radial-gradient(closest-side at 80% 55%, rgba(46,196,120,0.30), transparent 70%)";

/** One piece of the lockup, drawn at a known height.
 *
 *  The box is stated twice — as HTML attributes and as CSS — so it exists
 *  before the image does. Nothing reflows when the bytes land, which is the
 *  whole reason the logo used to jump around as its three parts arrived at
 *  three different moments.
 *
 *  Small renders use the inlined copy, which is already in the bundle: no
 *  request, no gap between the page painting and the logo appearing. Bigger
 *  ones take the full-resolution file, where the extra pixels are worth a
 *  fetch — and the space is reserved either way, so it cannot shift. */
function Art({
  art, height, alt, style,
}: {
  art: BrandArt;
  height: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const h = Math.round(height);
  const w = Math.round((h * art.w) / art.h);
  // 3x covers the densest phone screens.
  const src = art.inline && art.inlineH && h * 3 <= art.inlineH ? art.inline : art.src;
  return (
    <img
      src={src}
      width={w}
      height={h}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      loading="eager"
      decoding="sync"
      fetchPriority="high"
      style={{ display: "block", width: w, height: h, maxWidth: "100%", ...style }}
    />
  );
}

function Glow({ size, wide }: { size: number; wide?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: wide
          ? `-${Math.round(size * 0.9)}px -${Math.round(size * 1.4)}px`
          : `-${Math.round(size * 0.9)}px`,
        zIndex: -1,
        pointerEvents: "none",
        background: GLOW,
        filter: "blur(28px)",
      }}
    />
  );
}

export function LateenLogo({
  size = 68,
  variant = "mark",
  lang = "en",
  showTagline = true,
  glow = false,
}: Props) {
  if (variant === "wordmark") {
    const word = lang === "ar" ? WORDMARK_AR : WORDMARK_EN;
    const tag = lang === "ar" ? TAGLINE_AR : TAGLINE_EN;

    return (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "100%",
          isolation: "isolate",
        }}
      >
        {glow && <Glow size={size} wide />}
        <Art art={MARK} height={size * MARK_H} />
        <Art
          art={word}
          height={size * WORD_H[lang]}
          alt="Wasla"
          style={{ marginTop: Math.round(size * MARK_TO_WORD[lang]) }}
        />
        {showTagline && (
          <Art
            art={tag}
            height={size * TAG_H[lang]}
            style={{ marginTop: Math.round(size * WORD_TO_TAG[lang]), opacity: 0.85 }}
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
      {glow && <Glow size={size} />}
      <Art art={MARK} height={size * MARK_H} alt="Wasla" />
    </div>
  );
}
