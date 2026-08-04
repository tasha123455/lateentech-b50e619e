-- ============================================================================
-- A marketer's commission becomes withdrawable when the order is delivered,
-- not when the receipt is approved.
--
-- Before this migration admin_approve_order credited the full commission
-- straight into wallets.balance — the withdrawable pot — at the very first
-- step of an order's life. The shop had not confirmed, nothing had shipped,
-- and nobody yet knew whether the order would work out. A marketer could
-- therefore withdraw and be paid commission on an order that was later
-- refunded, and admin_refund_order would then deduct from a balance that no
-- longer held the money:
--
--     approve   balance 0  -> 50
--     paid      balance 50 -> 0     (admin_mark_payout_paid zeroes it)
--     refund    balance 0  -> -50   (nothing left to take back)
--
-- wallets already has the column for this. `pending` was written by the
-- original confirm_order/mark_delivered pair and stopped being used when
-- those functions were rewritten; it has sat at zero ever since. It goes back
-- to its original meaning here:
--
--     pending  money on the way  — commission on orders still in progress
--     balance  money available   — commission on orders that completed
--
-- The wallet total the marketer sees is unchanged. What changes is which part
-- of it can be withdrawn, and therefore what a refund can reach.
--
-- Negative balances are still possible, deliberately: a delivered order can
-- still be refunded after the commission has been withdrawn. That case is a
-- real dispute rather than an accident of timing, and the negative balance is
-- how the marketer carries the debt — it blocks withdrawal on its own (a
-- withdrawal needs balance >= min_withdraw) and it nets itself off against
-- their next delivered order.
--
-- Five functions move together because they are the only writers of these two
-- columns, and a split that half-applies would lose money.
--
-- ----------------------------------------------------------------------------
-- Orders that already exist
--
-- Every order approved before today had its commission credited straight to
-- `balance` under the old rule. If delivery simply started crediting `balance`
-- again those orders would pay twice, and moving their money across in a
-- backfill cannot work either: where a marketer has already withdrawn it, the
-- money is genuinely gone and the transfer would push them negative for
-- following a rule that was the platform's own at the time.
--
-- So each order records which pot its commission went into. Orders approved
-- from now on carry the flag and are settled out of `pending`; the ones
-- already in flight keep the behaviour they were created under and are left
-- exactly where they are. No backfill, no double credit, and no marketer wakes
-- up in debt because the rules changed underneath them.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.commission_pending IS
  'True when this order''s commission was credited to wallets.pending at approval (the rule from 2026-08-04). False for orders approved under the older rule, whose commission went straight to wallets.balance. Decides which pot delivery, failure and refund move the money out of.';

-- 1. Approval credits the money as on-the-way ---------------------------------
--
-- The withdraw-cycle clock does NOT start here any more. It used to start the
-- moment approval pushed the balance past the minimum; now approval does not
-- touch the balance at all, so the clock belongs with delivery.
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

  -- commission_pending marks this order as settled out of `pending`, so
  -- delivery, failure and refund all know which pot to move it out of.
  UPDATE public.orders
    SET status = 'approved', reviewed_at = now(), commission_pending = true
    WHERE id = _order_id RETURNING * INTO o;

  amt := o.commission * o.qty;

  INSERT INTO public.wallets (user_id, balance, pending) VALUES (o.marketer_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets
    SET pending = COALESCE(pending, 0) + amt,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  data_payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'cover_focus_x', p.cover_focus_x, 'cover_focus_y', p.cover_focus_y, 'fulfilment', p.fulfilment,
    'qty', o.qty, 'size', o.size, 'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
    'customer_city', o.customer_city, 'customer_country', o.customer_country,
    'customer_notes', o.customer_notes);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'receipt_verified', 'Receipt Verified',
            'Your payment receipt has been verified. Your commission is on the way and becomes available when the order is delivered.', data_payload);
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.business_id, 'new_order', 'New order',
            'A new order has been received. Check the Orders page.', data_payload);

  RETURN o;
END; $function$;

-- 2. Delivery makes it available ---------------------------------------------
--
-- Only for orders approved under the new rule. One approved earlier already
-- has its commission sitting in `balance`; touching the wallet again here
-- would pay it twice.
CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text; amt numeric; mk public.markets;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark delivered'; END IF;
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Order is not confirmed'; END IF;
  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE public.products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;

  IF o.commission_pending THEN
    amt := o.commission * o.qty;
    mk := public.market_for_user(o.marketer_id);

    INSERT INTO public.wallets (user_id, balance, pending) VALUES (o.marketer_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.wallets
      SET pending = COALESCE(pending, 0) - amt,
          balance = COALESCE(balance, 0) + amt,
          -- The wait before a withdrawal starts the first time the available
          -- money crosses the market's minimum, which is now here rather than
          -- at approval.
          withdraw_cycle_started_at = CASE
            WHEN COALESCE(balance, 0) < mk.min_withdraw
             AND COALESCE(balance, 0) + amt >= mk.min_withdraw
            THEN now() ELSE withdraw_cycle_started_at END,
          updated_at = now()
      WHERE user_id = o.marketer_id;
  END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_delivered', 'Order Delivered', 'The customer has received the product. Your commission is now available to withdraw.',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'cover_focus_x', p.cover_focus_x, 'cover_focus_y', p.cover_focus_y, 'fulfilment', p.fulfilment, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes));
  RETURN o;
END;
$function$;

-- 3. A failed delivery releases the money instead of stranding it -------------
--
-- Before this migration the commission was already in `balance` by the time a
-- business could mark an order failed, and mark_failed left it there — the
-- marketer kept it. That outcome is preserved rather than quietly changed:
-- without this the money would sit in `pending` for an order that can never be
-- delivered, and the marketer could never reach it.
--
-- If the intent is that a failed delivery should COST the marketer their
-- commission, change this to subtract from `pending` and credit nothing. That
-- is a policy decision, not a mechanical one, so it is not made here.
--
-- Orders approved under the old rule already have the money in `balance` and
-- are left alone, which is exactly what they did before.
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text; amt numeric; mk public.markets;
        clean_note text := NULLIF(trim(COALESCE(_note,'')), '');
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark this order failed'; END IF;
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;

  -- Only orders whose commission was actually credited. A 'pending' order was
  -- never approved, so there is nothing on the way to release.
  IF o.commission_pending AND o.status IN ('approved','confirmed') THEN
    amt := o.commission * o.qty;
    mk := public.market_for_user(o.marketer_id);
    UPDATE public.wallets
      SET pending = COALESCE(pending, 0) - amt,
          balance = COALESCE(balance, 0) + amt,
          withdraw_cycle_started_at = CASE
            WHEN COALESCE(balance, 0) < mk.min_withdraw
             AND COALESCE(balance, 0) + amt >= mk.min_withdraw
            THEN now() ELSE withdraw_cycle_started_at END,
          updated_at = now()
      WHERE user_id = o.marketer_id;
  END IF;

  UPDATE public.orders SET status = 'cancelled', business_notes = clean_note WHERE id = _order_id RETURNING * INTO o;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_failed', 'Order failed',
      COALESCE(p.name, 'Order') || ' marked failed by business',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'cover_focus_x', p.cover_focus_x, 'cover_focus_y', p.cover_focus_y, 'fulfilment', p.fulfilment, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END; $function$;

-- 4. A refund takes the money back from wherever it actually is ---------------
--
-- Undelivered orders (approved / confirmed) have their commission in
-- `pending`, so that is what shrinks and no balance is touched at all — this
-- is the case that used to create most of the negative balances, and it can no
-- longer create any.
--
-- A delivered order has its commission in `balance`, and if the marketer has
-- already withdrawn it the balance goes negative. That is intended: it is a
-- debt, it blocks any further withdrawal by itself, and the marketer's next
-- delivered order pays it down.
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders; p public.products; amt numeric; photo text; payload jsonb;
  was_delivered boolean;
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

  -- Read before the status is overwritten: the refund sets it to 'cancelled',
  -- and after that there is no way to tell which pot the money is in.
  was_delivered := (o.status = 'delivered');

  IF was_delivered THEN
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

  -- Delivered money is in `balance` whichever rule approved it. Undelivered
  -- money is in `pending` only for orders approved under the new rule; the
  -- older ones still have it in `balance`.
  IF was_delivered OR NOT o.commission_pending THEN
    UPDATE public.wallets SET balance = balance - amt, updated_at = now() WHERE user_id = o.marketer_id;
  ELSE
    UPDATE public.wallets SET pending = pending - amt, updated_at = now() WHERE user_id = o.marketer_id;
  END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_id', o.product_id, 'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'cover_focus_x', p.cover_focus_x, 'cover_focus_y', p.cover_focus_y, 'fulfilment', p.fulfilment,
    'amount', amt, 'qty', o.qty, 'size', o.size, 'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
    'customer_city', o.customer_city, 'customer_country', o.customer_country,
    'customer_notes', o.customer_notes,
    'admin_comment', clean_comment, 'admin_note', clean_comment);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_refunded', 'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00')
        || CASE WHEN was_delivered OR NOT o.commission_pending
                THEN ' was deducted from your wallet balance.'
                ELSE ' was removed from your commission on the way.' END,
      payload);

  RETURN o;
END;
$function$;

-- 5. Paying a withdrawal clears the available money only ---------------------
--
-- The old version set pending to 0 as well. That was harmless while pending
-- was always 0; now it holds commission on orders still in progress, and
-- zeroing it here would delete money the marketer has not been paid.
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

GRANT EXECUTE ON FUNCTION public.admin_approve_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivered(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_failed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
