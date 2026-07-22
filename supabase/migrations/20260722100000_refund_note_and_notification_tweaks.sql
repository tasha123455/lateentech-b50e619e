-- ============================================================================
-- Refund / notification tweaks
--
-- 1. admin_refund_order now takes an optional admin comment ("Admin note"),
--    stored on orders.refund_note, and the notification it fires now carries
--    full order + customer details (like the other order notifications)
--    plus that comment, so the marketer app can show an expandable card with
--    the order info and an optional admin note — same as other order
--    notifications. The comment box stays optional: a NULL/blank comment is
--    simply not shown.
--
-- 2. admin_note_payout (the "send a note to a marketer whose withdrawal
--    needs attention" flow) now also stores its note in the notification's
--    `data` column so the marketer app can show it inside an expandable
--    "Admin note" card (tap to know more) instead of as plain inline text.
--
-- 3. admin_resolve_report now includes the marketer's own original report
--    message in the notification data, so it can be shown alongside the
--    report type in the "Report reviewed" notification.
-- ============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_note text;

-- Signature is changing (uuid) -> (uuid, text), so the old overload needs to
-- be dropped explicitly; CREATE OR REPLACE alone would just add a second
-- overload rather than replacing it.
DROP FUNCTION IF EXISTS public.admin_refund_order(uuid);

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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved receipts can be refunded';
  END IF;
  IF o.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'This order has already been refunded';
  END IF;

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
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_refunded',
      COALESCE(p.name, 'An order') || ' fee was refunded back to the customer',
      to_char(amt, 'FM999999990.00') || ' was deducted from your wallet to the customer',
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'product_photo', photo,
        'amount', amt,
        'qty', o.qty,
        'size', o.size,
        'color', o.color,
        'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address,
        'customer_city', o.customer_city,
        'customer_country', o.customer_country,
        'customer_notes', o.customer_notes,
        'admin_comment', clean_comment
      )
    );

  RETURN o;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO service_role;

-- ── Payout "needs attention" note now carries structured data too ──────────
CREATE OR REPLACE FUNCTION public.admin_note_payout(_payout_id uuid, _note text)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      jsonb_build_object('payout_id', pay.id, 'amount', pay.amount, 'admin_comment', _note)
    );

  RETURN pay;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_note_payout(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_note_payout(uuid, text) TO service_role;

-- ── Report review notification now includes the marketer's own report text ─
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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) TO authenticated;
