// Wasla brand mark / wordmark lockup.
import { MarkSvg, TaglineSvg, WordmarkSvg } from "./logoArt";

type Props = {
  size?: number;
  variant?: "mark" | "wordmark";
  lang?: "en" | "ar";
  showTagline?: boolean;
  glow?: boolean;
};

/* Proportions of the lockup, expressed against `size`.
 *
 * The art was once padded, and the layout leaned on that padding — heights were
 * set on the whole canvas and negative margins pulled the empty parts back
 * together. These numbers are that geometry, measured off the original
 * canvases, so the lockup lands exactly where it always did. */
const MARK_H = 0.80282;
const WORD_H = { en: 0.37979, ar: 0.33745 };
const TAG_H = { en: 0.09, ar: 0.11 };
const MARK_TO_WORD = { en: 0.37958, ar: 0.31862 };
const WORD_TO_TAG = { en: 0.50862, ar: 0.34192 };

const GLOW =
  "radial-gradient(closest-side at 22% 45%, rgba(232,32,86,0.35), transparent 70%), " +
  "radial-gradient(closest-side at 50% 30%, rgba(180,45,220,0.32), transparent 70%), " +
  "radial-gradient(closest-side at 80% 55%, rgba(46,196,120,0.30), transparent 70%)";

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
        <MarkSvg height={size * MARK_H} />
        <WordmarkSvg
          lang={lang}
          height={size * WORD_H[lang]}
          style={{ marginTop: Math.round(size * MARK_TO_WORD[lang]) }}
        />
        {showTagline && (
          <TaglineSvg
            lang={lang}
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
      <MarkSvg height={size * MARK_H} />
    </div>
  );
}
