-- 1) Soft ban/freeze flags on profiles (reversible, unlike the old hard-delete ban)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

-- 2) Admin: toggle a user's banned state (reversible)
CREATE OR REPLACE FUNCTION public.admin_set_user_banned(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles
     SET banned_at = CASE WHEN _banned THEN now() ELSE NULL END
   WHERE id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_banned(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_banned(uuid, boolean) TO authenticated;

-- 3) Admin: toggle a user's frozen state (reversible)
CREATE OR REPLACE FUNCTION public.admin_set_user_frozen(_user_id uuid, _frozen boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles
     SET frozen_at = CASE WHEN _frozen THEN now() ELSE NULL END
   WHERE id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_frozen(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_frozen(uuid, boolean) TO authenticated;

-- 4) Admin: look up a single user's real email (used for the "Go to Account" /
--    impersonation profile view, so it shows the actual user's email rather
--    than the admin's own session email)
CREATE OR REPLACE FUNCTION public.admin_get_user_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  RETURN _email;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_user_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_email(uuid) TO authenticated;

-- 5) Admin: batch email lookup for the Users list (shows email alongside phone)
CREATE OR REPLACE FUNCTION public.admin_list_user_emails(_user_ids uuid[])
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u WHERE u.id = ANY(_user_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_user_emails(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails(uuid[]) TO authenticated;

-- 6) Fix: marketers re-uploading a rejected receipt were blocked by the
--    "Marketers cannot modify financial or status fields on orders" trigger,
--    because resetting receipt_url/status back to pending touches restricted
--    fields. Let the trigger recognize a sanctioned, transaction-scoped
--    bypass flag, and have marketer_reupload_receipt set it — giving
--    re-upload the same effect as the normal (insert-based) upload path.
CREATE OR REPLACE FUNCTION public.orders_restrict_marketer_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass restrictions
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Sanctioned system functions (e.g. marketer_reupload_receipt) bypass this
  -- check for the duration of their own transaction only.
  IF current_setting('app.bypass_marketer_order_restrictions', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Apply only when the marketer (owner) is updating their own order
  IF auth.uid() = OLD.marketer_id THEN
    IF NEW.business_id    IS DISTINCT FROM OLD.business_id
    OR NEW.marketer_id    IS DISTINCT FROM OLD.marketer_id
    OR NEW.product_id     IS DISTINCT FROM OLD.product_id
    OR NEW.commission     IS DISTINCT FROM OLD.commission
    OR NEW.unit_price     IS DISTINCT FROM OLD.unit_price
    OR NEW.platform_fee   IS DISTINCT FROM OLD.platform_fee
    OR NEW.shipping_fee   IS DISTINCT FROM OLD.shipping_fee
    OR NEW.delivery_fee   IS DISTINCT FROM OLD.delivery_fee
    OR NEW.status         IS DISTINCT FROM OLD.status
    OR NEW.confirmed_at   IS DISTINCT FROM OLD.confirmed_at
    OR NEW.delivered_at   IS DISTINCT FROM OLD.delivered_at
    OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
    OR NEW.admin_notes    IS DISTINCT FROM OLD.admin_notes
    OR NEW.receipt_url    IS DISTINCT FROM OLD.receipt_url
    OR NEW.receipt_uploaded_at IS DISTINCT FROM OLD.receipt_uploaded_at
    OR NEW.marketer_confirmed_at IS DISTINCT FROM OLD.marketer_confirmed_at
    THEN
      RAISE EXCEPTION 'Marketers cannot modify financial or status fields on orders';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketer_reupload_receipt(_order_id uuid, _receipt_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _receipt_url IS NULL OR length(trim(_receipt_url)) = 0 THEN RAISE EXCEPTION 'Receipt URL required'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.marketer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF o.status NOT IN ('rejected','pending') THEN RAISE EXCEPTION 'Cannot re-upload receipt for order in status %', o.status; END IF;

  PERFORM set_config('app.bypass_marketer_order_restrictions', 'on', true);

  UPDATE public.orders
     SET receipt_url = _receipt_url,
         receipt_uploaded_at = now(),
         marketer_confirmed_at = now(),
         admin_notes = NULL,
         reviewed_at = NULL,
         status = 'pending'
   WHERE id = _order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.marketer_reupload_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketer_reupload_receipt(uuid, text) TO authenticated;
