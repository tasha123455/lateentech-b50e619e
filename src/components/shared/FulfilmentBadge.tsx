import { asFulfilment, fulfilmentColour, fulfilmentLabel } from "@/lib/fulfilment";

/** The حجز / تسليم فوري pill, drawn the same way in all six places it appears.
 *
 *  Renders nothing for a product listed before the choice existed — an empty
 *  badge would be a claim its owner never made. `data-no-i18n` because the
 *  label is already in the reader's language and the text-node walker would
 *  otherwise try to translate it a second time. */
export function FulfilmentBadge({
  value, ar, size = "md", style,
}: {
  value: unknown;
  ar: boolean;
  /** "sm" for the corner of a grid tile, "md" for a row inside a card. */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}) {
  const f = asFulfilment(value);
  if (!f) return null;
  const c = fulfilmentColour(f);
  const sm = size === "sm";
  return (
    <span
      data-no-i18n
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: sm ? "3px 7px 2px" : "4px 9px 3px",
        borderRadius: 999,
        background: c.bg,
        border: "0.5px solid " + c.border,
        color: c.fg,
        fontSize: sm ? 10 : 11,
        fontWeight: 600,
        // Arabic ascenders sit higher than the declared line box, so the same
        // 1.35 that keeps قريباً off its own border is used here.
        lineHeight: 1.35,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
    >
      {f === "instant" ? (
        <svg width={sm ? 9 : 10} height={sm ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" />
        </svg>
      ) : (
        <svg width={sm ? 9 : 10} height={sm ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      )}
      {fulfilmentLabel(f, ar)}
    </span>
  );
}
