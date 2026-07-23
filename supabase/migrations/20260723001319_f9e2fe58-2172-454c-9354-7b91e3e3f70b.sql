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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
REVOKE ALL ON FUNCTION public.admin_send_notification(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_send_notification(uuid, text, text, text) TO authenticated;

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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF clean_title IS NULL THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  SELECT ur.user_id, 'admin_message', clean_title, clean_body,
         jsonb_build_object('message', clean_body, 'photo', _photo)
  FROM public.user_roles ur
  WHERE ur.role = 'marketer';

  GET DIAGNOSTICS sent_count = ROW_COUNT;
  RETURN sent_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text) TO authenticated;

UPDATE public.notifications
SET
  kind = 'admin_message',
  data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('message', body)
WHERE kind IN ('admin_message', 'admin_broadcast')
  AND (data IS NULL OR NOT (data ? 'message'))
  AND body IS NOT NULL;

NOTIFY pgrst, 'reload schema';