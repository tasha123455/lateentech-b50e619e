
CREATE OR REPLACE FUNCTION public.notify_product_review(
  _product_id uuid,
  _rating int,
  _text text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT business_id, name INTO _biz, _pname
  FROM public.products WHERE id = _product_id;

  IF _biz IS NULL THEN RETURN; END IF;

  SELECT COALESCE(full_name, business_name, 'Marketer') INTO _author
  FROM public.profiles WHERE id = _uid;

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
      'marketer_id', _uid
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_product_review(uuid,int,text) TO authenticated;
