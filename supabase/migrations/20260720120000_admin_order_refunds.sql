-- ============================================================================
-- Refunds, for the Order Verification Hub's new "Refund customer" button.
--
-- Deliberately narrow in scope: refunding an order does NOT change its
-- status, touch stock, or touch the marketer's wallet balance. All it does
-- is stamp refunded_at. That's enough on its own because
-- admin_get_metrics-equivalent logic (getMetrics() in lateen-api.ts) already
-- computes "total platform fee" live from orders.status + orders.qty +
-- orders.platform_fee on every read, rather than maintaining a running
-- total column anywhere — so once an order is excluded from that
-- computation (see the client-side change alongside this migration), its
-- platform fee simply stops being counted, with no separate ledger to keep
-- in sync. The order otherwise keeps showing as "Approved" everywhere else
-- in the app (business dashboard, marketer dashboard, etc.), exactly as
-- before refunding.
--
-- Only an already-approved receipt can be refunded (there's no real
-- platform-fee revenue to claw back from a pending or rejected one), and
-- only once.
-- ============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
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
    SET refunded_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  RETURN o;
END;
$function$;
