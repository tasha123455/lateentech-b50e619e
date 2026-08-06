-- Clear the receipt paths that point at nothing. Run once, by hand.
--
-- NOT a migration, and not about the app. The first version of the lifecycle
-- tests wrote made-up receipt paths onto the orders it created — `receipts:WASLA-E2E/…`
-- — without putting a file behind them. The receipts bucket only accepts an
-- upload whose first folder is the uploader's own id, so those paths never
-- could have had a file: they are test debt, not a bug in the shop.
--
-- The seed now uploads a real one-pixel JPEG and stores the path it actually
-- wrote, so nothing new is broken. This is only for the orders made before
-- that.
--
-- Why it needs a hand: every dashboard that lists an order asks storage to
-- sign its receipt. A path with nothing behind it comes back 400, the browser
-- logs it, and the two "no console errors" tests fail on rubbish left by an
-- earlier run rather than on anything the app did. The marketer's own token
-- cannot fix it — row-level security refuses to let anybody rewrite
-- `receipt_url` straight at the table, which is right, and is the reason this
-- file exists.
--
-- Safe on a live platform in the sense that it touches only rows whose path is
-- one no real upload can produce. It is still not something to run without
-- reading, so: read it.

BEGIN;

-- What will change, before it changes.
SELECT count(*) AS orders_pointing_at_nothing
  FROM public.orders o
 WHERE o.receipt_url IS NOT NULL
   AND o.receipt_url LIKE 'receipts:%'
   AND o.receipt_url NOT LIKE 'receipts:' || o.marketer_id::text || '/%';

-- A missing receipt is better represented by no receipt than by a path that
-- 400s every time a page draws it.
UPDATE public.orders o
   SET receipt_url = NULL
 WHERE o.receipt_url IS NOT NULL
   AND o.receipt_url LIKE 'receipts:%'
   AND o.receipt_url NOT LIKE 'receipts:' || o.marketer_id::text || '/%';

COMMIT;

-- Should be zero.
SELECT count(*) AS still_pointing_at_nothing
  FROM public.orders o
 WHERE o.receipt_url IS NOT NULL
   AND o.receipt_url LIKE 'receipts:%'
   AND o.receipt_url NOT LIKE 'receipts:' || o.marketer_id::text || '/%';
