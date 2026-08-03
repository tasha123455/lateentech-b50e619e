-- "Succeeded receipts" counted rejected ones, and a re-upload took one away.
--
-- The count was keyed on orders.reviewed_at, which is set by *both* review
-- outcomes: admin_approve_order sets it, and admin_reject_order_with_notes
-- sets it too. So every receipt the admin turned down was counted as a
-- success. And because marketer_reupload_receipt clears reviewed_at to put
-- the order back in the queue, a marketer fixing their receipt made the
-- number go *down* — a figure that moves the wrong way when someone corrects
-- a mistake is worse than one that is merely too high.
--
-- Reviewed is not the same thing as approved. The count now asks whether the
-- receipt was accepted, which is what the order's status records:
--
--   approved / confirmed / delivered  — accepted, and moving through the flow
--   cancelled                         — accepted, then the delivery failed or
--                                       the order was refunded; the receipt
--                                       was still good money at the till
--   rejected                          — turned down. Not a success.
--   pending / draft                   — nobody has looked at it yet.
--
-- That is the same set of statuses the platform fee already uses, and for the
-- same reason: both are asking "did this receipt clear?", not "what happened
-- to the parcel afterwards?". A failed delivery does not un-take the money.
--
-- Now that the two questions share one answer, they share one expression, so
-- they cannot drift apart again.
--
-- The re-upload case falls out of this rather than needing its own rule: an
-- order awaiting re-review is pending, pending was never counted, so there is
-- nothing to take away.
--
-- The columns are renamed from reviewed_* to approved_* to say what they now
-- hold. Renaming an output column changes the function's return type, which
-- CREATE OR REPLACE cannot do, hence the DROP.

DROP FUNCTION IF EXISTS public.admin_metrics_daily(text, text);

CREATE FUNCTION public.admin_metrics_daily(
  _market text DEFAULT NULL,
  _tz text DEFAULT 'Africa/Tripoli'
)
RETURNS TABLE (
  d date,
  users_created integer,
  products_created integer,
  fee_earned numeric,
  fee_refunded numeric,
  approved_added integer,
  approved_removed integer,
  pieces_added integer,
  pieces_removed integer,
  pieces_confirmed integer,
  salary_paid numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_can('adm-home') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  WITH
  /* Accounts that count as users, restricted to the chosen market. */
  people AS (
    SELECT p.id, p.created_at
      FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
       AND (COALESCE(btrim(p.full_name), '') <> '' OR COALESCE(btrim(p.business_name), '') <> '')
       AND (_market IS NULL OR COALESCE(p.market, 'LY') = _market)
  ),
  /* Every account in the market, named or not — an order belongs to a market
     through the business behind it, and that business is a real account
     whether or not it passes the "counts as a user" rule above. */
  market_ids AS (
    SELECT p.id FROM public.profiles p
     WHERE _market IS NULL OR COALESCE(p.market, 'LY') = _market
  ),
  prods AS (
    SELECT pr.created_at
      FROM public.products pr
     WHERE _market IS NULL OR pr.business_id IN (SELECT id FROM market_ids)
  ),
  /* One question, asked once: did this receipt clear? The fee and the
     succeeded count both hang off it. */
  ord_raw AS (
    SELECT o.qty, o.platform_fee,
           o.created_at, o.confirmed_at, o.reviewed_at, o.delivered_at, o.refunded_at,
           (o.status IN ('approved','confirmed','delivered','cancelled')) AS receipt_ok
      FROM public.orders o
     WHERE _market IS NULL OR o.business_id IN (SELECT id FROM market_ids)
  ),
  ord AS (
    SELECT qty, receipt_ok,
           /* Fee as earned on the day the order reached a fee-eligible
              status, regardless of any later refund — the reversal is its own
              dated event below, so a refund never rewrites the original day. */
           CASE WHEN receipt_ok THEN COALESCE(platform_fee,0) * COALESCE(qty,0) ELSE 0 END AS fee,
           created_at, confirmed_at, reviewed_at, delivered_at, refunded_at
      FROM ord_raw
  ),
  events AS (
    SELECT (created_at AT TIME ZONE _tz)::date AS d,
           0 AS uc, 0 AS pc, fee AS fe, 0::numeric AS fr,
           0 AS aa, 0 AS ar, 0 AS pa, 0 AS pr_, 0 AS pcf, 0::numeric AS sp
      FROM ord
    UNION ALL
    /* The reversal, dated to when the refund actually happened. */
    SELECT (refunded_at AT TIME ZONE _tz)::date, 0,0, 0::numeric, fee, 0,0,0,0,0, 0::numeric
      FROM ord WHERE refunded_at IS NOT NULL
    UNION ALL
    /* Counted on the day the receipt was accepted. reviewed_at is when the
       admin ruled on it; receipt_ok is which way they ruled. */
    SELECT (reviewed_at AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 1,0,0,0,0, 0::numeric
      FROM ord WHERE reviewed_at IS NOT NULL AND receipt_ok
    UNION ALL
    /* Removed at the later of the two dates. A refund that landed before the
       order was ever reviewed means it never counted, so the removal has to
       sit on the review date rather than earlier — otherwise the line dips
       below zero for the days in between. */
    SELECT (GREATEST(reviewed_at, refunded_at) AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 0,1,0,0,0, 0::numeric
      FROM ord WHERE reviewed_at IS NOT NULL AND refunded_at IS NOT NULL AND receipt_ok
    UNION ALL
    SELECT (delivered_at AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 0,0, COALESCE(qty,0), 0,0, 0::numeric
      FROM ord WHERE delivered_at IS NOT NULL
    UNION ALL
    SELECT (GREATEST(delivered_at, refunded_at) AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 0,0,0, COALESCE(qty,0), 0, 0::numeric
      FROM ord WHERE delivered_at IS NOT NULL AND refunded_at IS NOT NULL
    UNION ALL
    SELECT (confirmed_at AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 0,0,0,0, COALESCE(qty,0), 0::numeric
      FROM ord WHERE confirmed_at IS NOT NULL
    UNION ALL
    SELECT (created_at AT TIME ZONE _tz)::date, 1,0, 0::numeric,0::numeric, 0,0,0,0,0, 0::numeric
      FROM people
    UNION ALL
    SELECT (created_at AT TIME ZONE _tz)::date, 0,1, 0::numeric,0::numeric, 0,0,0,0,0, 0::numeric
      FROM prods
    UNION ALL
    /* Salaries are not split by market: employees are paid by the platform,
       not by a country, so they stay whole in every view. */
    SELECT (ep.paid_at AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 0,0,0,0,0, COALESCE(ep.amount,0)
      FROM public.employee_payments ep WHERE ep.paid_at IS NOT NULL
  )
  SELECT e.d,
         SUM(e.uc)::integer, SUM(e.pc)::integer,
         SUM(e.fe)::numeric, SUM(e.fr)::numeric,
         SUM(e.aa)::integer, SUM(e.ar)::integer,
         SUM(e.pa)::integer, SUM(e.pr_)::integer, SUM(e.pcf)::integer,
         SUM(e.sp)::numeric
    FROM events e
   WHERE e.d IS NOT NULL
   GROUP BY e.d
   ORDER BY e.d;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_metrics_daily(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
