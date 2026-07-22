
CREATE OR REPLACE FUNCTION public.admin_send_notification(_user_id uuid, _title text, _body text, _photo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _title IS NULL OR length(trim(_title)) = 0 THEN
    RAISE EXCEPTION 'Title required';
  END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (_user_id, 'admin_message', _title, _body,
    jsonb_build_object('photo', _photo));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(_title text, _body text, _photo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _title IS NULL OR length(trim(_title)) = 0 THEN
    RAISE EXCEPTION 'Title required';
  END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  SELECT p.id, 'admin_broadcast', _title, _body, jsonb_build_object('photo', _photo)
  FROM public.profiles p;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_notification(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text) TO authenticated;
