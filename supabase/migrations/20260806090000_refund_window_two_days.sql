-- The refund window drops from five days to two.
--
-- Five was long enough to read as the payout cycle rather than as a refund
-- window — a marketer seeing "available in 5 days" next to "withdrawals every
-- 30 days" has two waiting periods and no way to tell which is which. Two days
-- is plainly a fraud check on a delivery that has just happened, which is what
-- it is.
--
-- release_matured_commission() reads the market's current setting, so shrinking
-- the window only ever releases money sooner: nobody waits longer than they
-- were told. Because the new window applies to orders already delivered as
-- well, the app shows the market's current number everywhere rather than the
-- `available_in_days` stamped onto each notification — an old card saying five
-- would be describing a wait nobody is actually serving.

ALTER TABLE public.markets
  ALTER COLUMN refund_window_days SET DEFAULT 2;

UPDATE public.markets SET refund_window_days = 2 WHERE code = 'LY';

COMMENT ON COLUMN public.markets.refund_window_days IS
  'Days after delivery during which an order can still be refunded. The '
  'commission sits in wallets.pending until it closes, then becomes '
  'withdrawable. Two days in Libya.';

-- The delivered notification's stored wording is changed too, but not here:
-- this file originally carried a CREATE OR REPLACE for `business_mark_delivered`,
-- a function that exists nowhere in this schema. The one the app calls is
-- `mark_delivered`. Running it as written would have created a second, dead
-- function and left the live one untouched, so the block was removed and the
-- wording moved to 20260806110000, against the real function and with its
-- guards intact.
--
-- The change above stands on its own regardless: refund_window_days is a table
-- value and mark_delivered reads it at call time.

NOTIFY pgrst, 'reload schema';
