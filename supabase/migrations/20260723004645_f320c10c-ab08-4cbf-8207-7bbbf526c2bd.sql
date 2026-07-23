
-- 1) Broadcast notifications to all marketers AND business owners (dedup).
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(_title text, _body text, _photo text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  clean_title text := NULLIF(trim(COALESCE(_title, '')), '');
  clean_body text := NULLIF(trim(COALESCE(_body, '')), '');
  sent_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
$function$;

-- 2) Payout note: include the admin's note in the notification data so the
-- marketer's UI can expand the item and show the message.
CREATE OR REPLACE FUNCTION public.admin_note_payout(_payout_id uuid, _note text)
 RETURNS payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

-- 3) Refund: add a refund_note column, and recreate admin_refund_order with
-- the signature the frontend uses: (_order_id uuid, _comment text).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_note text;

DROP FUNCTION IF EXISTS public.admin_refund_order(uuid);
DROP FUNCTION IF EXISTS public.admin_refund_order(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  amt numeric;
  photo text;
  clean_comment text := NULLIF(trim(COALESCE(_comment, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Only approved receipts can be refunded'; END IF;
  IF o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'This order has already been refunded'; END IF;

  UPDATE public.orders
    SET refunded_at = now(),
        refund_note = clean_comment
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;
  UPDATE public.wallets
    SET balance = balance - amt,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_refunded',
      'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'product_photo', photo,
        'amount', amt,
        'admin_comment', clean_comment,
        'admin_note', clean_comment
      )
    );

  RETURN o;
END;
$function$;
