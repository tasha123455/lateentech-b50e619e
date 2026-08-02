-- An admin scoped to a country sees that country, and nothing else.
--
-- Until now the scope was recorded and honoured for *actions* — an admin
-- could be refused an operation — but every list still returned the whole
-- platform. This closes that: the filter goes into the row-level policies, so
-- it applies to any query at all, including one an admin writes by hand
-- against the API rather than through the console.
--
-- Filtering in the app would not have been a permission. It would have been a
-- suggestion.
--
-- Unrestricted admins (markets IS NULL) and masters are unaffected: every
-- check below short-circuits to true for them, so today's console behaves
-- exactly as it does now.

-- Nobody with the admin role should be without a scope row, or the checks
-- below would shut them out of their own platform. The original seed covered
-- everyone who existed then; this covers anyone granted the role since.
INSERT INTO public.admin_accounts (email, user_id, full_name, is_master, markets, pages, active)
SELECT lower(u.email), u.id, COALESCE(p.full_name, 'Administrator'), true, NULL,
       ARRAY(SELECT id FROM public.admin_pages), true
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
 WHERE r.role = 'admin'
   AND u.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.admin_accounts a WHERE a.user_id = r.user_id)
ON CONFLICT (email) DO NOTHING;

-- One lookup rather than three.
--
-- Returns NULL when the caller has no active admin row, and a NULL in a
-- policy's USING clause reads as false — so an account that is not an admin,
-- or whose admin access was suspended, matches no rows at all.
CREATE OR REPLACE FUNCTION public.admin_can_market(_market text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN a.is_master OR a.markets IS NULL THEN true
           -- Rows written before markets existed are Libyan, which is where
           -- they actually belong.
           ELSE COALESCE(_market, 'LY') = ANY(a.markets)
         END
    FROM public.admin_accounts a
   WHERE a.user_id = auth.uid() AND a.active
   LIMIT 1;
$function$;

-- For the tables that hang off a person rather than carrying a market of
-- their own: a payout, a wallet, a report, a deletion request.
CREATE OR REPLACE FUNCTION public.admin_sees_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.admin_can_market(
    (SELECT market FROM public.profiles WHERE id = _user_id)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.admin_can_market(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sees_user(uuid) TO authenticated;

/* ---- tables that carry a market of their own ----------------------------- */

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market));

DROP POLICY IF EXISTS "Admins view all products" ON public.products;
CREATE POLICY "Admins view all products"
  ON public.products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market));

DROP POLICY IF EXISTS "Admins update all products" ON public.products;
CREATE POLICY "Admins update all products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market));

DROP POLICY IF EXISTS "Admins view all orders" ON public.orders;
CREATE POLICY "Admins view all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market));

DROP POLICY IF EXISTS "Admins update all orders" ON public.orders;
CREATE POLICY "Admins update all orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.admin_can_market(market));

/* ---- tables that hang off a person --------------------------------------- */

DROP POLICY IF EXISTS "Admins view all payouts" ON public.payouts;
CREATE POLICY "Admins view all payouts"
  ON public.payouts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(user_id));

DROP POLICY IF EXISTS "Admins view all wallets" ON public.wallets;
CREATE POLICY "Admins view all wallets"
  ON public.wallets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(user_id));

DROP POLICY IF EXISTS "Admins view all notifications" ON public.notifications;
CREATE POLICY "Admins view all notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(user_id));

DROP POLICY IF EXISTS "Admins view all user_roles" ON public.user_roles;
CREATE POLICY "Admins view all user_roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(user_id));

DROP POLICY IF EXISTS "Admins view all deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Admins view all deletion requests"
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(user_id));

DROP POLICY IF EXISTS "Admins read change requests" ON public.change_requests;
CREATE POLICY "Admins read change requests"
  ON public.change_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(user_id));

DROP POLICY IF EXISTS "Admins view all reports" ON public.reports;
CREATE POLICY "Admins view all reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(marketer_id));

DROP POLICY IF EXISTS "Admins update reports" ON public.reports;
CREATE POLICY "Admins update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(marketer_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.admin_sees_user(marketer_id));

/* ---- and the two functions that hand back emails -------------------------- */

-- These take user ids as an argument, so the policy above cannot protect
-- them: a scoped admin could pass any id at all. They filter themselves.

CREATE OR REPLACE FUNCTION public.admin_get_user_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _email text;
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.admin_sees_user(_user_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  RETURN _email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_user_emails(_user_ids uuid[])
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  -- Ids outside this admin's markets are dropped rather than refused: the
  -- caller is a list of people to annotate, and one stranger in it should
  -- leave the rest working.
  RETURN QUERY
    SELECT u.id, u.email::text
      FROM auth.users u
     WHERE u.id = ANY(_user_ids)
       AND public.admin_sees_user(u.id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
