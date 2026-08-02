-- Every admin action now asks which page it belongs to.
--
-- These are the live definitions of the 24 admin functions, unchanged except
-- for their guard: `has_role(auth.uid(), 'admin')` becomes
-- `admin_can('<page>')`. The bodies were taken from the migrations that
-- defined them and transformed mechanically, so this diff is only the gate.
--
-- Why it matters: before this, one flag meant everything. An admin hired to
-- verify receipts could call admin_delete_user directly and it would work,
-- because the only question asked was "are you an admin at all". Which page an
-- action belongs to is now part of the question.
--
-- The 'Admin only' message is left as it was, so nothing in the app that
-- matches on it has to change.


/* ---- adm-receipts ---- */

CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders; p public.products; photo text; amt numeric; data_payload jsonb;
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- Option B: the reservation placed when the marketer submitted the receipt is
  -- simply carried forward. No qty/reserved_qty/variant commit happens here —
  -- that is exclusively the business owner's confirm_order step.

  UPDATE public.orders SET status = 'approved', reviewed_at = now() WHERE id = _order_id RETURNING * INTO o;

  amt := o.commission * o.qty;

  INSERT INTO public.wallets (user_id, balance) VALUES (o.marketer_id, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets
    SET balance = COALESCE(balance, 0) + amt,
        withdraw_cycle_started_at = CASE
          WHEN COALESCE(balance, 0) < 20 AND COALESCE(balance, 0) + amt >= 20 THEN now()
          ELSE withdraw_cycle_started_at END,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  data_payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_name', COALESCE(p.name, ''), 'product_photo', photo,
    'qty', o.qty, 'size', o.size, 'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
    'customer_city', o.customer_city, 'customer_country', o.customer_country,
    'customer_notes', o.customer_notes);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'receipt_verified', 'Receipt Verified',
            'Your payment receipt has been verified. Your balance is now updated', data_payload);
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.business_id, 'new_order', 'New order',
            'A new order has been received. Check the Orders page.', data_payload);

  RETURN o;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_reject_order(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.orders SET status = 'rejected', receipt_url = NULL
    WHERE id = _order_id RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_order_with_notes(_order_id uuid, _notes text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
  receipt text;
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT receipt_url INTO receipt FROM public.orders WHERE id = _order_id;
  UPDATE public.orders
    SET status = 'rejected',
        admin_notes = _notes,
        reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'receipt_rejected',
      'Receipt rejected by the admin',
      COALESCE(_notes, ''),
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'product_photo', photo,
        'receipt_url', receipt,
        'admin_notes', _notes,
        'qty', o.qty,
        'size', o.size,
        'color', o.color,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address,
        'customer_city', o.customer_city,
        'customer_country', o.customer_country,
        'customer_notes', o.customer_notes
      )
    );

  RETURN o;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders; p public.products; amt numeric; photo text; payload jsonb;
  clean_comment text := NULLIF(trim(COALESCE(_comment, '')), '');
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;

  PERFORM set_config('app.bypass_product_lock', 'on', true);
  PERFORM set_config('app.bypass_marketer_order_restrictions', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status NOT IN ('approved','confirmed','delivered') THEN
    RAISE EXCEPTION 'Only approved, confirmed or delivered orders can be refunded';
  END IF;
  IF o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'This order has already been refunded'; END IF;

  IF o.status = 'delivered' THEN
    UPDATE public.products
      SET sold = sold - o.qty,
          revenue = revenue - (o.unit_price * o.qty),
          updated_at = now()
      WHERE id = o.product_id;
  END IF;

  -- Admin comments live only in refund_note; business_notes is reserved for
  -- notes the business owner actually wrote themselves.
  UPDATE public.orders
    SET refunded_at = now(),
        refund_note = clean_comment,
        status = 'cancelled'
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;
  UPDATE public.wallets SET balance = balance - amt, updated_at = now() WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN p.photos[1] ELSE NULL END;

  payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_id', o.product_id, 'product_name', COALESCE(p.name, ''), 'product_photo', photo,
    'amount', amt, 'qty', o.qty, 'size', o.size, 'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
    'customer_city', o.customer_city, 'customer_country', o.customer_country,
    'customer_notes', o.customer_notes,
    'admin_comment', clean_comment, 'admin_note', clean_comment);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_refunded', 'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
      payload);
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.business_id, 'order_refunded', 'Order refunded',
      'Order ' || COALESCE(p.name, '') || ' refunded for customer ' || COALESCE(o.customer_name, ''), payload);

  RETURN o;
END; $function$;


/* ---- adm-payouts ---- */

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid, _receipt_url text DEFAULT NULL)
RETURNS payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
  mk public.markets;
  current_balance numeric := 0;
  paid_amount numeric := 0;
  clean_receipt text := NULLIF(trim(COALESCE(_receipt_url, '')), '');
BEGIN
  IF NOT public.admin_can('adm-payouts') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF clean_receipt IS NULL THEN
    RAISE EXCEPTION 'A receipt photo is required to mark this payout as paid';
  END IF;

  SELECT * INTO pay
    FROM public.payouts
    WHERE id = _payout_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;
  IF pay.status = 'paid' THEN
    RAISE EXCEPTION 'Already paid';
  END IF;

  -- The marketer's market, not the admin's: the admin verifying the transfer
  -- may not be in the same country as the person being paid.
  mk := public.market_for_user(pay.user_id);

  SELECT COALESCE(balance, 0) INTO current_balance
    FROM public.wallets
    WHERE user_id = pay.user_id
    FOR UPDATE;

  paid_amount := GREATEST(COALESCE(current_balance, 0), COALESCE(pay.amount, 0));

  INSERT INTO public.wallets (user_id, balance, pending, withdraw_cycle_started_at)
    VALUES (pay.user_id, 0, 0, NULL)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = 0,
                  pending = 0,
                  withdraw_cycle_started_at = NULL,
                  updated_at = now();

  UPDATE public.payouts
    SET amount = paid_amount,
        status = 'paid',
        paid_at = now(),
        receipt_url = clean_receipt
    WHERE id = _payout_id
    RETURNING * INTO pay;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      pay.user_id,
      'payout_paid',
      'Withdrawal Completed',
      'Amount: ' || to_char(paid_amount, 'FM999999999990.00') || ' ' || mk.currency_code
        || E'\n' || 'Your withdrawal has been paid successfully.',
      -- The currency travels with the payout so the app never has to assume
      -- which market the reader is in.
      jsonb_build_object('amount', paid_amount, 'currency', mk.currency_code,
                         'photo', clean_receipt, 'receipt_url', clean_receipt)
    );

  RETURN pay;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_note_payout(_payout_id uuid, _note text)
 RETURNS payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
BEGIN
  IF NOT public.admin_can('adm-payouts') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN
    RAISE EXCEPTION 'Note required';
  END IF;

  UPDATE public.payouts
    SET admin_note = _note,
        noted_at = now(),
        status = 'failed'
    WHERE id = _payout_id
      AND status = 'requested'
    RETURNING * INTO pay;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found or already closed';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      pay.user_id,
      'payout_note',
      'Withdrawal request needs attention',
      _note,
      jsonb_build_object('admin_comment', _note, 'admin_note', _note, 'amount', pay.amount)
    );

  RETURN pay;
END;
$function$;


/* ---- adm-users ---- */

CREATE OR REPLACE FUNCTION public.admin_ban_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS public.email_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.email_bans;
  em text;
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  SELECT lower(email) INTO em FROM auth.users WHERE id = _user_id;
  IF em IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.email_bans (email, reason, banned_by)
    VALUES (em, _reason, auth.uid())
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
    RETURNING * INTO b;

  PERFORM public.mark_user_account_deleted(_user_id);
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ban_email(_email text, _reason text DEFAULT NULL)
RETURNS public.email_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.email_bans;
  uid uuid;
  norm text := lower(trim(_email));
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF norm IS NULL OR norm = '' THEN
    RAISE EXCEPTION 'Email required';
  END IF;

  INSERT INTO public.email_bans (email, reason, banned_by)
    VALUES (norm, _reason, auth.uid())
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
    RETURNING * INTO b;

  -- Also delete any existing user with this email
  SELECT id INTO uid FROM auth.users WHERE lower(email) = norm LIMIT 1;
  IF uid IS NOT NULL AND uid <> auth.uid() THEN
    DELETE FROM auth.users WHERE id = uid;
  END IF;

  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unban_email(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  DELETE FROM public.email_bans WHERE email = lower(trim(_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  PERFORM public.mark_user_account_deleted(_user_id);
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles
     SET banned_at = CASE WHEN _banned THEN now() ELSE NULL END
   WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_frozen(_user_id uuid, _frozen boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
     SET frozen_at = CASE WHEN _frozen THEN now() ELSE NULL END
   WHERE id = _user_id;

  PERFORM set_config('app.bypass_product_lock', 'on', true);

  IF _frozen THEN
    UPDATE public.products
       SET status = 'paused', frozen_paused = true, updated_at = now()
     WHERE business_id = _user_id
       AND deleted_at IS NULL
       AND status = 'active';
  ELSE
    UPDATE public.products
       SET status = 'active', frozen_paused = false, updated_at = now()
     WHERE business_id = _user_id
       AND deleted_at IS NULL
       AND frozen_paused = true
       AND status = 'paused';
    UPDATE public.products
       SET frozen_paused = false
     WHERE business_id = _user_id AND frozen_paused = true;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_user_email(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  RETURN _email;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_user_emails(_user_ids uuid[])
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u WHERE u.id = ANY(_user_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(_user_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify your own roles';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
END;
$$;


/* ---- adm-products ---- */

CREATE OR REPLACE FUNCTION public.admin_delete_product(_product_id uuid)
RETURNS products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF NOT public.admin_can('adm-products') THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  UPDATE public.products
    SET deleted_at = COALESCE(deleted_at, now()), status = 'hidden', updated_at = now()
    WHERE id = _product_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_product_status(_product_id uuid, _status text)
RETURNS products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF NOT public.admin_can('adm-products') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _status NOT IN ('active','hidden','paused') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  UPDATE public.products SET status = _status, updated_at = now()
    WHERE id = _product_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.list_product_reviews(_product_id uuid)
RETURNS TABLE (
  id uuid,
  marketer_id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  photo_url text,
  avatar_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.marketer_id, r.rating, r.comment, r.created_at, r.updated_at,
         COALESCE(NULLIF(TRIM(p.full_name), ''), 'Marketer') AS author_name,
         r.photo_url,
         p.avatar_url AS avatar_path
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.marketer_id
  WHERE r.product_id = _product_id
    AND EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = r.product_id
        AND pr.deleted_at IS NULL
        AND (pr.status = 'active' OR public.admin_can('adm-products'))
    )
  ORDER BY r.created_at DESC;
$$;


/* ---- adm-requests ---- */

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id UUID, _comment TEXT)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
  p public.products;
  _photo text;
BEGIN
  IF NOT public.admin_can('adm-requests') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _comment IS NULL OR length(trim(_comment)) = 0 THEN
    RAISE EXCEPTION 'Comment is required';
  END IF;

  UPDATE public.reports
    SET status = 'resolved',
        admin_comment = _comment,
        resolved_at = now(),
        reviewed_by = auth.uid()
    WHERE id = _report_id
    RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF r.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = r.product_id;
    IF FOUND AND p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN
      _photo := p.photos[1];
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      r.reporter_id,
      'report_reviewed',
      'Report reviewed',
      _comment,
      jsonb_build_object(
        'report_id', r.id,
        'report_type', r.report_type,
        'report_message', r.message,
        'product_id', r.product_id,
        'product_name', p.name,
        'product_photo', _photo,
        'admin_comment', _comment
      )
    );

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_deletion_request(_id UUID, _action TEXT, _comment TEXT)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.account_deletion_requests;
  _sched TIMESTAMPTZ;
  _target_email TEXT;
  _bypass BOOLEAN := false;
BEGIN
  IF NOT public.admin_can('adm-requests') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _action NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  IF _action = 'reject' AND (_comment IS NULL OR length(trim(_comment)) = 0) THEN
    RAISE EXCEPTION 'A reason is required to reject a request';
  END IF;

  IF _action = 'approve' THEN
    SELECT lower(u.email) INTO _target_email
      FROM public.account_deletion_requests adr
      JOIN auth.users u ON u.id = adr.user_id
      WHERE adr.id = _id;
    _bypass := (_target_email = 'tashy8838@gmail.com');
    _sched := CASE WHEN _bypass THEN now() ELSE now() + interval '14 days' END;

    UPDATE public.account_deletion_requests
      SET status = 'scheduled', scheduled_for = _sched, admin_comment = _comment,
          resolved_at = now(), reviewed_by = auth.uid()
      WHERE id = _id AND status = 'wallet_review'
      RETURNING * INTO r;
  ELSE
    UPDATE public.account_deletion_requests
      SET status = 'rejected', admin_comment = _comment,
          resolved_at = now(), reviewed_by = auth.uid()
      WHERE id = _id AND status IN ('wallet_review','scheduled')
      RETURNING * INTO r;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already resolved';
  END IF;

  IF _action = 'approve' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (
        r.user_id, 'account_deletion_scheduled',
        'Account deletion scheduled',
        'Your account deletion has been approved.',
        jsonb_build_object('request_id', r.id, 'scheduled_for', r.scheduled_for, 'admin_comment', _comment)
      );
  ELSE
    INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (
        r.user_id, 'account_deletion_rejected',
        'Account deletion request declined',
        _comment,
        jsonb_build_object('request_id', r.id, 'admin_comment', _comment)
      );
  END IF;

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_change_request(_id uuid, _comment text)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.change_requests;
BEGIN
  IF NOT public.admin_can('adm-requests') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.change_requests
     SET status = 'done',
         admin_comment = _comment,
         resolved_at = now(),
         resolved_by = auth.uid()
   WHERE id = _id AND status = 'open'
   RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already closed';
  END IF;

  /* The person hears back in the app, the way they do for a reviewed report —
     otherwise the only sign anything happened is their details quietly being
     different. */
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    r.user_id,
    'change_request_done',
    'Your details were updated',
    COALESCE(NULLIF(trim(_comment), ''), 'An admin has updated your account details.'),
    jsonb_build_object('change_request_id', r.id, 'fields', to_jsonb(r.fields))
  );

  RETURN r;
END;
$$;


/* ---- adm-notify ---- */

CREATE OR REPLACE FUNCTION public.admin_send_notification(
  _user_id uuid,
  _title text,
  _body text,
  _photo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_title text := NULLIF(trim(COALESCE(_title, '')), '');
  clean_body text := NULLIF(trim(COALESCE(_body, '')), '');
BEGIN
  IF NOT public.admin_can('adm-notify') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF clean_title IS NULL THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    _user_id,
    'admin_message',
    clean_title,
    clean_body,
    jsonb_build_object('message', clean_body, 'photo', _photo)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  _title text,
  _body text,
  _photo text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_title text := NULLIF(trim(COALESCE(_title, '')), '');
  clean_body text := NULLIF(trim(COALESCE(_body, '')), '');
  sent_count integer;
BEGIN
  IF NOT public.admin_can('adm-notify') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF clean_title IS NULL THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  SELECT DISTINCT ur.user_id, 'admin_message', clean_title, clean_body,
         jsonb_build_object('message', clean_body, 'photo', _photo)
  FROM public.user_roles ur
  WHERE ur.role IN ('marketer', 'business');

  GET DIAGNOSTICS sent_count = ROW_COUNT;
  RETURN sent_count;
END;
$$;


/* ---- adm-home ---- */

CREATE OR REPLACE FUNCTION public.admin_presence_stats(_day date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can('adm-home') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _day IS NULL THEN
    RETURN public.live_user_count();
  END IF;
  RETURN COALESCE((SELECT peak FROM public.presence_daily WHERE day = _day), 0);
END;
$$;


/* ---- wiping the platform is the master's alone --------------------------- */

CREATE OR REPLACE FUNCTION public.admin_wipe_all_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res jsonb;
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT jsonb_build_object(
    'orders', (SELECT count(*) FROM public.orders),
    'products', (SELECT count(*) FROM public.products),
    'payouts', (SELECT count(*) FROM public.payouts),
    'employees', (SELECT count(*) FROM public.employees)
  ) INTO res;

  DELETE FROM public.product_reviews WHERE true;
  DELETE FROM public.favorites WHERE true;
  DELETE FROM public.orders WHERE true;
  DELETE FROM public.products WHERE true;
  DELETE FROM public.payouts WHERE true;
  DELETE FROM public.reports WHERE true;
  DELETE FROM public.notifications WHERE true;
  DELETE FROM public.account_deletion_requests WHERE true;
  DELETE FROM public.employee_payments WHERE true;
  DELETE FROM public.employees WHERE true;
  DELETE FROM public.email_send_log WHERE true;

  UPDATE public.wallets
     SET balance = 0, pending = 0, withdraw_cycle_started_at = NULL, updated_at = now()
   WHERE true;

  RETURN res;
END;
$$;


NOTIFY pgrst, 'reload schema';
