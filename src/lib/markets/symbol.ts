import { MARKETS } from "./index";

/** The symbol to print for a currency code when nothing else supplied one.
 *
 *  Screens fall back to this when a wallet has no movements yet, so there is
 *  no amount to take a symbol from. It used to be a hard-coded pound — a
 *  leftover from the template this started as, which is how a Libyan wallet
 *  with nothing in it could sit there labelled in sterling.
 *
 *  Answered from the markets themselves, so a market added later is right
 *  without anyone remembering to come back here. An unknown code comes back
 *  as itself: an honest "USD" beats a confident wrong glyph. */
export function marketSymbol(code: string | null | undefined): string {
  const want = String(code || "").trim().toUpperCase();
  if (!want) return "";
  for (const m of Object.values(MARKETS)) {
    if (m.money.currencyCode.toUpperCase() === want) return m.money.currencySymbol || want;
  }
  return want;
}
