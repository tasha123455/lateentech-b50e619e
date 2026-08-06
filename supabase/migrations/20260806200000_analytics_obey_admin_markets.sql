-- Analytics answers for the countries the asker is allowed, and no others.
--
-- The two analytics functions checked that the caller may open the Analytics
-- page, and then answered whatever they asked for. An admin scoped to one
-- country could ask for another country's figures by name, or ask for all of
-- them by asking for none — from the console, or with a single call written by
-- hand against the API. The scope was recorded, shown in the console, and used
-- to build the filter chips; it was never applied to the numbers.
--
-- The rest of the platform already went through this. From the migration that
-- put market scope into the row-level policies:
--
--     Filtering in the app would not have been a permission.
--     It would have been a suggestion.
--
-- Analytics was the one thing left out of that, because these two functions
-- are SECURITY DEFINER and read straight past the policies — which is exactly
-- why they have to do the checking themselves.
--
-- What changes for whom:
--   • A master admin, or one with no scope: nothing at all. Both cases resolve
--     to "every market", which is what the functions did before.
--   • An admin scoped to countries: asking for one of theirs answers for that
--     one; asking for a country that is not theirs is refused rather than
--     quietly emptied, because a wrong answer of zero is worse than an error;
--     asking for nothing in particular answers for all of theirs together,
--     rather than for the platform.
--
-- Salaries stay whole in every view, as they already did: employees are paid
-- by the platform rather than by a country, so there is nothing to split.

-- The caller's countries come from admin_market_codes(), which has been there
-- since admins were given scope: NULL for a master or an unrestricted admin,
-- meaning every market. Nothing new is introduced here — the answer was always
-- available, these two functions simply never asked for it.

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
DECLARE
  -- Which countries this answer may cover. NULL is every one of them.
  scope text[];
BEGIN
  IF NOT public.admin_can('adm-home') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _market IS NOT NULL THEN
    -- IS NOT TRUE rather than NOT (...): the check answers NULL for somebody
    -- who is not an active admin, and NOT NULL is NULL, which an IF quietly
    -- treats as "carry on".
    IF public.admin_can_market(_market) IS NOT TRUE THEN
      RAISE EXCEPTION 'Not your market: %', _market;
    END IF;
    scope := ARRAY[_market];
  ELSE
    scope := public.admin_market_codes();
  END IF;

  RETURN QUERY
  WITH
  /* Accounts that count as users, restricted to the countries in scope. */
  people AS (
    SELECT p.id, p.created_at
      FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
       AND (COALESCE(btrim(p.full_name), '') <> '' OR COALESCE(btrim(p.business_name), '') <> '')
       AND (scope IS NULL OR COALESCE(p.market, 'LY') = ANY(scope))
  ),
  /* Every account in those countries, named or not — an order belongs to a
     market through the business behind it, and that business is a real account
     whether or not it passes the "counts as a user" rule above. */
  market_ids AS (
    SELECT p.id FROM public.profiles p
     WHERE scope IS NULL OR COALESCE(p.market, 'LY') = ANY(scope)
  ),
  prods AS (
    SELECT pr.created_at
      FROM public.products pr
     WHERE scope IS NULL OR pr.business_id IN (SELECT id FROM market_ids)
  ),
  /* One question, asked once: did this receipt clear? The fee and the
     succeeded count both hang off it. */
  ord_raw AS (
    SELECT o.qty, o.platform_fee,
           o.created_at, o.confirmed_at, o.reviewed_at, o.delivered_at, o.refunded_at,
           (o.status IN ('approved','confirmed','delivered','cancelled')) AS receipt_ok
      FROM public.orders o
     WHERE scope IS NULL OR o.business_id IN (SELECT id FROM market_ids)
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


CREATE OR REPLACE FUNCTION public.admin_metrics_active_users(_market text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
  scope text[];
BEGIN
  IF NOT public.admin_can('adm-home') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _market IS NOT NULL THEN
    IF public.admin_can_market(_market) IS NOT TRUE THEN
      RAISE EXCEPTION 'Not your market: %', _market;
    END IF;
    scope := ARRAY[_market];
  ELSE
    scope := public.admin_market_codes();
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT o.marketer_id AS uid FROM public.orders o
     WHERE o.created_at > now() - interval '30 days'
       AND o.marketer_id IS NOT NULL
       AND (scope IS NULL OR o.business_id IN (
             SELECT p.id FROM public.profiles p
              WHERE COALESCE(p.market,'LY') = ANY(scope)))
    UNION
    SELECT o.business_id FROM public.orders o
     WHERE o.created_at > now() - interval '30 days'
       AND o.business_id IS NOT NULL
       AND (scope IS NULL OR o.business_id IN (
             SELECT p.id FROM public.profiles p
              WHERE COALESCE(p.market,'LY') = ANY(scope)))
  ) x;

  RETURN COALESCE(n, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_metrics_active_users(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
