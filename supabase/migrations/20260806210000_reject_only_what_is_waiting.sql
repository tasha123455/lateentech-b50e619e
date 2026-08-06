-- A receipt can only be rejected while it is still waiting to be looked at.
--
-- `admin_reject_order_with_notes` was the one step in the order's life with no
-- opinion about where the order had got to. Every sibling has one:
--
--   admin_approve_order   status = 'pending'
--   confirm_order         status = 'approved'
--   mark_delivered        status = 'confirmed'
--   mark_failed           status NOT IN ('cancelled','rejected','delivered')
--   admin_refund_order    status IN ('approved','confirmed','delivered')
--   admin_reject_...      — nothing —
--
-- It reads as an oversight rather than a decision, and it dates from when the
-- only door into this function was the pending-receipts queue, where the only
-- thing that could be on screen was a pending order. That is still the only
-- door in the interface. It is not the only door in the database: the function
-- is callable by anyone the receipts page is open to, against any order id.
--
-- What that allowed, and what the browser tests now prove is closed:
--
--   1. An order that had been delivered — receipt accepted, goods shipped,
--      customer holding them — could be sent back to 'rejected'. The shop's
--      `sold` and `revenue` kept counting the sale, because only a refund
--      takes those back off, so the shop's own figures and the order's status
--      disagreed with each other permanently.
--
--   2. Worse, and the reason this is not cosmetic: 'rejected' is one of the
--      two states `marketer_reupload_receipt` accepts. So a rejected-after-
--      delivery order could be given a new receipt, returning it to 'pending',
--      from where `admin_approve_order` — whose own guard is satisfied,
--      because the order really is pending again — credited the commission a
--      second time. The loop had no counter and no end. Each turn round it
--      added another commission to the marketer's wallet for one order that
--      was delivered once.
--
-- Both need an administrator with receipts access to start them, so this is
-- not something a marketer could do alone. It is something an administrator
-- could do by mistake with two clicks, and something a dishonest one could do
-- deliberately, for as much money as they liked, once. Country-scoped
-- administrators make the second worth taking seriously.
--
-- The guard is the same sentence as the approve function's, because they are
-- the two answers to the same question and should accept the same orders.
-- Nothing else in the function changes: the notification, its payload and the
-- returned row are exactly as they were.

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

  -- Read and lock first, so that two administrators reaching the queue at the
  -- same moment cannot both pass the check below.
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  receipt := o.receipt_url;

  UPDATE public.orders
    SET status = 'rejected',
        admin_notes = _notes,
        reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

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
        'product_photo', photo, 'cover_focus_x', p.cover_focus_x, 'cover_focus_y', p.cover_focus_y, 'fulfilment', p.fulfilment,
        'receipt_url', receipt,
        'admin_notes', _notes,
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
        'customer_notes', o.customer_notes
      )
    );

  RETURN o;
END $function$;

GRANT EXECUTE ON FUNCTION public.admin_reject_order_with_notes(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Orders already broken by this
--
-- Nothing is repaired here, on purpose. An order that went round the loop has
-- had real money added to a real wallet, and quietly subtracting it in a
-- migration would be a second unexplained movement on top of the first. This
-- finds them, so the decision is made by somebody looking at the list:
--
--   SELECT o.id, o.order_number, o.status, o.marketer_id,
--          o.commission * o.qty AS commission,
--          o.delivered_at, o.reviewed_at
--     FROM public.orders o
--    WHERE o.delivered_at IS NOT NULL
--      AND o.status IN ('rejected', 'pending', 'approved', 'confirmed')
--    ORDER BY o.delivered_at DESC;
--
-- A row here is an order that reached 'delivered' and then moved backwards,
-- which after this migration cannot happen again. On a platform that has not
-- launched, the expected result is the handful the browser tests made, and
-- nothing else.
