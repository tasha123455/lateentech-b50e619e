CREATE OR REPLACE FUNCTION public.notify_product_review(_product_id uuid, _rating integer, _text text, _photo text DEFAULT NULL::text, _avatar text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _biz uuid; _pname text; _author text; _uid uuid := auth.uid(); _has_order boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Invalid rating'; END IF;
  IF NOT public.has_role(_uid, 'marketer') THEN
    RAISE EXCEPTION 'Only marketers can review products';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE product_id = _product_id
      AND marketer_id = _uid
      AND status IN ('confirmed','delivered')
  ) INTO _has_order;
  IF NOT _has_order THEN
    RAISE EXCEPTION 'You can only review products you have successfully ordered';
  END IF;
  SELECT business_id, name INTO _biz, _pname FROM public.products WHERE id = _product_id;
  IF _biz IS NULL THEN RETURN; END IF;
  SELECT COALESCE(full_name, business_name, 'Marketer') INTO _author FROM public.profiles WHERE id = _uid;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (_biz, 'product_review', 'New product review',
    COALESCE(_author,'Marketer') || ' rated ' || COALESCE(_pname,'your product') || ' ' || _rating || '★',
    jsonb_build_object('product_id', _product_id, 'product_name', _pname, 'rating', _rating,
      'text', _text, 'author', _author, 'marketer_id', _uid, 'photo', _photo, 'avatar', _avatar));
END;
$function$;