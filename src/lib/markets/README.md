# Markets

Everything that is true of one country and not of another.

The app launched in Libya. Libya's answers were scattered across roughly thirty
places — fee constants in the marketer module, a withdrawal floor inside a
Postgres function, a phone rule in the register form, a bank list, a support
number, a deposit account, a city list, a date locale. Collecting them was
cheap while there was one country and every value was known to be right. It
would not have been cheap later, with balances in wallets and orders in flight.

Nothing here changes behaviour. The values are exactly what the app used
before they were gathered.

## The two halves

**`src/lib/markets/`** — everything the app decides.
`types.ts` is the contract, `libya.ts` is the answer, `index.ts` is the
registry and the helpers derived from a spec.

**`public.markets`** — everything the database decides.
The withdrawal rules are enforced where the balances are, so `request_payout`,
`get_payout_state` and `admin_mark_payout_paid` read the caller's row via
`market_for_user(uuid)`.

The money fields exist in both and **must be changed together**: `fee_pct`,
`fee_fixed`, `fee_threshold`, `min_withdraw`, `payout_cycle_days` mirror
`MarketSpec.money`. Nothing enforces that automatically.

## Adding a country

1. **Write `src/lib/markets/<country>.ts`.** Export a `MarketSpec`. Every field
   is required, so TypeScript will refuse to compile until each question has an
   answer — there is no way to quietly inherit Libya's platform fee or Libya's
   phone format.
2. **Add it to `MARKETS`** in `index.ts`.
3. **Insert the row** in a migration, with the money numbers matching the spec.

Then the work the compiler cannot see:

4. **Teach the screens to ask.** Today every screen reads Libya, because there
   is only Libya: `MIN_WITHDRAW`, `PAYOUT_BANKS`, `LIBYA_CITIES` and the rest
   are still module constants bound to `LIBYA`. With two markets they have to
   become `marketOf(profile.market)`. Start at the re-exports in
   `src/components/dashboard/marketer/lib/constants.ts` — they are all in one
   block, and each one names the market it is bound to.
5. **Decide what a cross-market order means.** A product's reach is already the
   set of country keys in `products.delivery`, so a business selling into two
   markets is a business with zones in two countries. What is *not* decided:
   which market's fee applies when the marketer and the business are in
   different ones, and which currency the order settles in.
6. **Scope the admin.** `has_role(uid, 'admin')` is global — one admin sees and
   verifies every market's receipts and payouts. If that should be per-market,
   it is a change to the role check, not to this folder.
7. **Recompute stored fees.** `products.platform_fee` is written when a product
   is saved, from the market's fee rule at that moment. Changing a market's fee
   does not move the products already priced under the old one.

## What is deliberately not here

**Language.** Arabic and English are a reader's preference, not a country's —
a Libyan market serves both, and so would any other.

**Product currency.** Already chosen per product, in `products.currency`.

**Delivery zones.** Already per country, in `products.delivery`.

**`profiles.country`.** Where the account holder is, which is a different
question from which market they trade in. A supplier in Turkey selling into
Libya is `country = 'TR'`, `market = 'LY'`.
