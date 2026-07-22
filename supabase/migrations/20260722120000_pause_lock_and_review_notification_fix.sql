-- ============================================================================
-- 1. Don't let a business owner pause a product while it still has active
--    marketer orders. Instead the dashboard queues the intent
--    (products.pause_requested = true) and shows a bilingual explanation.
--    The moment the product's active marketer count drops to 0, a trigger
--    on public.orders flips it to 'paused' automatically.
-- ============================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pause_requested boolean NOT NULL DEFAULT false;

-- Re-declare the product edit/delete lock to also (a) let pause_requested be
-- toggled freely, same as status/updated_at, and (b) actually block a
-- transition INTO 'paused' while active_marketers_count() is still > 0.
-- Every other rule already established in 20260720140000 is unchanged:
-- internal bypass flag still short-circuits everything, and any non-status
-- edit while there are active marketers is still blocked entirely.
CREATE OR REPLACE FUNCTION public.products_lock_while_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active integer;
BEGIN
  IF current_setting('app.bypass_product_lock', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- A pure status/pause_requested change (pause/activate/hide, or queuing a
  -- pause request) is exempt from the general edit-lock below. Pausing
  -- specifically is still gated by the check right after.
  IF (to_jsonb(NEW) - ARRAY['status','updated_at','pause_requested'])
     IS NOT DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','updated_at','pause_requested']) THEN

    IF NEW.status = 'paused' AND OLD.status IS DISTINCT FROM 'paused' THEN
      SELECT public.active_marketers_count(OLD.id) INTO _active;
      IF _active > 0 THEN
        RAISE EXCEPTION 'PRODUCT_HAS_ACTIVE_MARKETERS: this product has % active marketer(s) and cannot be paused until those orders complete.', _active
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  SELECT public.active_marketers_count(OLD.id) INTO _active;
  IF _active > 0 THEN
    RAISE EXCEPTION 'PRODUCT_LOCKED: this product has % active marketer(s) and cannot be edited or deleted until those orders complete.', _active
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Fires after any order transitions out of the active set (pending/approved/
-- confirmed -> delivered/cancelled/rejected). If the product it belongs to
-- was waiting on a queued pause request and now has zero active marketers,
-- pause it for real.
CREATE OR REPLACE FUNCTION public.products_auto_pause_when_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active integer;
  _pause_requested boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND OLD.status IN ('pending','approved','confirmed')
     AND NEW.status NOT IN ('pending','approved','confirmed') THEN

    SELECT pause_requested INTO _pause_requested FROM public.products WHERE id = NEW.product_id;
    IF COALESCE(_pause_requested, false) THEN
      SELECT public.active_marketers_count(NEW.product_id) INTO _active;
      IF _active = 0 THEN
        UPDATE public.products
           SET status = 'paused', pause_requested = false
         WHERE id = NEW.product_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_auto_pause_when_cleared ON public.orders;
CREATE TRIGGER trg_products_auto_pause_when_cleared
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.products_auto_pause_when_cleared();

COMMENT ON COLUMN public.products.pause_requested IS 'Business owner asked to pause this product while it still had active marketer orders. Cleared automatically (and status flipped to paused) once active_marketers_count() reaches 0, or cleared by any manual status change.';


-- ============================================================================
-- 2. Revert the review-notification eligibility gate added in 20260722104414.
--    It required the reviewing marketer to have a 'confirmed'/'delivered'
--    order on that exact product, but the review UI itself never enforced
--    that (any marketer can leave a review from the product page), so the
--    RPC was silently throwing and no notification ever reached the business
--    owner. Back to: any authenticated marketer's review notifies the owner.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_product_review(
  _product_id uuid,
  _rating integer,
  _text text,
  _photo text DEFAULT NULL::text,
  _avatar text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _biz uuid;
  _pname text;
  _author text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;
  IF NOT public.has_role(_uid, 'marketer') THEN
    RAISE EXCEPTION 'Only marketers can review products';
  END IF;

  SELECT business_id, name INTO _biz, _pname FROM public.products WHERE id = _product_id;
  IF _biz IS NULL THEN RETURN; END IF;

  SELECT COALESCE(full_name, business_name, 'Marketer') INTO _author FROM public.profiles WHERE id = _uid;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    _biz,
    'product_review',
    'New product review',
    COALESCE(_author,'Marketer') || ' rated ' || COALESCE(_pname,'your product') || ' ' || _rating || '★',
    jsonb_build_object(
      'product_id', _product_id,
      'product_name', _pname,
      'rating', _rating,
      'text', _text,
      'author', _author,
      'marketer_id', _uid,
      'photo', _photo,
      'avatar', _avatar
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_product_review(uuid,integer,text,text,text) TO authenticated;
