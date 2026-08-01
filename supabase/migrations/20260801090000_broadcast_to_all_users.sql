-- The admin's broadcast only ever reached marketers, so a message meant for
-- everyone silently skipped every shop on the platform. It now goes to all
-- users — marketers and businesses alike.
--
-- Admins are staff, not users, and are excluded: an admin broadcasting to
-- themselves is noise, not a notification. DISTINCT guards against a double
-- send to anyone holding both roles.
--
-- Nothing else about the function changes.

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
  SELECT DISTINCT ur.user_id, 'admin_message', clean_title, clean_body,
         jsonb_build_object('message', clean_body, 'photo', _photo)
  FROM public.user_roles ur
  WHERE ur.role IN ('marketer', 'business');

  GET DIAGNOSTICS sent_count = ROW_COUNT;
  RETURN sent_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text) TO authenticated;
