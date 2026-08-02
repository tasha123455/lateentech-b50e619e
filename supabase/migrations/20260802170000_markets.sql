-- Isolating Libya, database half.
--
-- The withdrawal rules are enforced here, not in the app, because that is
-- where the balances are. So "20" and "30 days" and the word "LYD" were
-- written into the bodies of request_payout, get_payout_state and
-- admin_mark_payout_paid — one country's answers, buried inside functions that
-- move real money.
--
-- This adds the row those functions should have been reading all along. It
-- changes no behaviour: the seeded numbers are exactly the ones the functions
-- had hardcoded, so every caller gets the same answer today as yesterday.
--
-- The app half lives in src/lib/markets/. The two overlap on the money
-- columns and have to be changed together; src/lib/markets/README.md says so.

CREATE TABLE IF NOT EXISTS public.markets (
  -- ISO 3166-1 alpha-2. Matches MarketSpec.code in the app.
  code              text PRIMARY KEY,
  name_en           text NOT NULL,
  name_ar           text NOT NULL,

  -- ISO 4217. Wallets, fees and payouts in this market are all denominated
  -- in it, which is why none of the numbers below can be shared: 5 and 100
  -- and 20 describe dinars and mean nothing in another currency.
  currency_code     text NOT NULL,

  -- Platform fee per unit sold: above fee_threshold take fee_pct of the unit
  -- price, at or below it take fee_fixed. Mirrors MarketSpec.money.fee.
  fee_pct           numeric NOT NULL,
  fee_fixed         numeric NOT NULL,
  fee_threshold     numeric NOT NULL,

  -- Smallest withdrawable balance, and the wait between withdrawals.
  min_withdraw      numeric NOT NULL,
  payout_cycle_days integer NOT NULL,

  -- Set when a market is closed to new business. Kept rather than deleted:
  -- profiles and orders point at this row and must keep resolving.
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT markets_code_format   CHECK (code ~ '^[A-Z]{2}$'),
  CONSTRAINT markets_fee_pct_range CHECK (fee_pct >= 0 AND fee_pct <= 1),
  CONSTRAINT markets_positive      CHECK (
    fee_fixed >= 0 AND fee_threshold >= 0 AND min_withdraw >= 0 AND payout_cycle_days > 0
  )
);

COMMENT ON TABLE public.markets IS
  'One row per country the platform runs in. Money rules live here because the withdrawal functions enforce them. Mirrors src/lib/markets/*.ts — change both together.';

-- Exactly the values the functions had inline before this migration.
INSERT INTO public.markets
  (code, name_en, name_ar, currency_code, fee_pct, fee_fixed, fee_threshold, min_withdraw, payout_cycle_days)
VALUES
  ('LY', 'Libya', 'ليبيا', 'LYD', 0.05, 5, 100, 20, 30)
ON CONFLICT (code) DO NOTHING;

-- Which market an account belongs to.
--
-- Not the same question as profiles.country, which is where the person is.
-- A supplier in Turkey selling into Libya lives in TR and trades in the LY
-- market, and telling those apart is the whole reason this is its own column.
--
-- Everyone who exists today is Libya, so the default backfills every existing
-- row correctly. That is only true once, which is why this is being added now
-- rather than when a second country arrives.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'LY'
    REFERENCES public.markets(code);

COMMENT ON COLUMN public.profiles.market IS
  'Market the account trades in. Distinct from country, which is where the account holder is.';

CREATE INDEX IF NOT EXISTS profiles_market_idx ON public.profiles (market);

-- Config, not user data: everyone signed in may read it, nobody may write it
-- from a browser. Changing a fee or a withdrawal floor is a migration.
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Markets readable by authenticated" ON public.markets;
CREATE POLICY "Markets readable by authenticated"
  ON public.markets FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.markets FROM authenticated, anon;

-- The caller's market row, for the payout functions below. SECURITY DEFINER
-- so it still resolves under RLS, and falling back to LY so an account that
-- somehow carries no market cannot be locked out of its own money.
CREATE OR REPLACE FUNCTION public.market_for_user(_user_id uuid)
RETURNS public.markets
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.*
    FROM public.markets m
   WHERE m.code = COALESCE(
           (SELECT p.market FROM public.profiles p WHERE p.id = _user_id),
           'LY'
         )
   LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.market_for_user(uuid) TO authenticated;
