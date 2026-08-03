-- Analytics stops downloading the platform to compute a number.
--
-- getMetrics pulled every order, every profile and every product into the
-- browser so the page could filter by date and draw its chart there. That is
-- the one query left with no ceiling, and the only one that cannot have a
-- plain one: the page adds up money, so dropping older rows would report less
-- than was earned.
--
-- So the rows are added up here instead, one bucket per calendar day, and the
-- browser gets a few hundred buckets rather than a hundred thousand orders.
-- Every filter and every chart line still works, because a day is the finest
-- grain any of them ever asked for.
--
-- The bucket boundaries follow the market's own timezone rather than the
-- reader's. For an admin in Libya that is what already happened; for one
-- abroad it is a change, and the right way round — an order belongs to the
-- day it happened where it happened, not to the day it was in whatever
-- country the admin opened the page from.

/* Which accounts are inside a market, applying the same "completed
   registration" rule the Users page uses: a bare auth stub with no role and
   no name is not a user and must not be counted.

   Rows carrying no market are Libyan, which is where every account created
   before markets existed actually belongs. */
CREATE OR REPLACE FUNCTION public.admin_metrics_daily(
  _market text DEFAULT NULL,
  _tz text DEFAULT 'Africa/Tripoli'
)
RETURNS TABLE (
  d date,
  users_created integer,
  products_created integer,
  fee_earned numeric,
  fee_refunded numeric,
  reviewed_added integer,
  reviewed_removed integer,
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
  ord AS (
    SELECT o.qty,
           /* Fee as earned on the day the order reached a fee-eligible
              status, regardless of any later refund — the reversal is its own
              dated event below, so a refund never rewrites the original day. */
           CASE WHEN o.status IN ('approved','confirmed','delivered','cancelled')
                THEN COALESCE(o.platform_fee,0) * COALESCE(o.qty,0)
                ELSE 0 END AS fee,
           o.created_at, o.confirmed_at, o.reviewed_at, o.delivered_at, o.refunded_at
      FROM public.orders o
     WHERE _market IS NULL OR o.business_id IN (SELECT id FROM market_ids)
  ),
  events AS (
    SELECT (created_at AT TIME ZONE _tz)::date AS d,
           0 AS uc, 0 AS pc, fee AS fe, 0::numeric AS fr,
           0 AS ra, 0 AS rr, 0 AS pa, 0 AS pr_, 0 AS pcf, 0::numeric AS sp
      FROM ord
    UNION ALL
    /* The reversal, dated to when the refund actually happened. */
    SELECT (refunded_at AT TIME ZONE _tz)::date, 0,0, 0::numeric, fee, 0,0,0,0,0, 0::numeric
      FROM ord WHERE refunded_at IS NOT NULL
    UNION ALL
    SELECT (reviewed_at AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 1,0,0,0,0, 0::numeric
      FROM ord WHERE reviewed_at IS NOT NULL
    UNION ALL
    /* Removed at the later of the two dates. A refund that landed before the
       order was ever reviewed means it never counted, so the removal has to
       sit on the review date rather than earlier — otherwise the line dips
       below zero for the days in between. */
    SELECT (GREATEST(reviewed_at, refunded_at) AT TIME ZONE _tz)::date, 0,0, 0::numeric,0::numeric, 0,1,0,0,0, 0::numeric
      FROM ord WHERE reviewed_at IS NOT NULL AND refunded_at IS NOT NULL
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
         SUM(e.ra)::integer, SUM(e.rr)::integer,
         SUM(e.pa)::integer, SUM(e.pr_)::integer, SUM(e.pcf)::integer,
         SUM(e.sp)::numeric
    FROM events e
   WHERE e.d IS NOT NULL
   GROUP BY e.d
   ORDER BY e.d;
END;
$function$;

/* The one number a daily bucket cannot hold: distinct people active in the
   last thirty days. Distinct counts do not add up — the same marketer
   ordering on Monday and Tuesday is one active user, not two — so it is
   counted here in one go rather than assembled from buckets. */
CREATE OR REPLACE FUNCTION public.admin_metrics_active_users(_market text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  IF NOT public.admin_can('adm-home') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT o.marketer_id AS uid FROM public.orders o
     WHERE o.created_at > now() - interval '30 days'
       AND o.marketer_id IS NOT NULL
       AND (_market IS NULL OR o.business_id IN (
             SELECT p.id FROM public.profiles p
              WHERE COALESCE(p.market,'LY') = _market))
    UNION
    SELECT o.business_id FROM public.orders o
     WHERE o.created_at > now() - interval '30 days'
       AND o.business_id IS NOT NULL
       AND (_market IS NULL OR o.business_id IN (
             SELECT p.id FROM public.profiles p
              WHERE COALESCE(p.market,'LY') = _market))
  ) x;

  RETURN COALESCE(n, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_metrics_daily(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics_active_users(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
