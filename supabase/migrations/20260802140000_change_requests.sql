-- "Please change my details" used to open WhatsApp with a pre-written message.
-- That put the request somewhere the admin panel could not see, count or close,
-- and left the person with nothing to look at afterwards. It is a request like
-- the reports and the deletion requests, so it now lives where those live.

CREATE TABLE IF NOT EXISTS public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /* Which of phone / email / country they want changed. Free text rather than
     an enum so adding a fourth thing later is a client change, not a migration. */
  fields text[] NOT NULL DEFAULT '{}',
  /* What they want it changed to, in their own words. Optional — somebody who
     has lost the email cannot always say much. */
  note text,
  status text NOT NULL DEFAULT 'open',
  admin_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS change_requests_open_idx
  ON public.change_requests (created_at DESC) WHERE status = 'open';

/* One open request per person. Asking twice should sharpen the first request,
   not add a second card for the admin to work out the difference between. */
CREATE UNIQUE INDEX IF NOT EXISTS change_requests_one_open_per_user
  ON public.change_requests (user_id) WHERE status = 'open';

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own change requests" ON public.change_requests;
CREATE POLICY "Own change requests" ON public.change_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read change requests" ON public.change_requests;
CREATE POLICY "Admins read change requests" ON public.change_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

/* Writing goes through the two functions below rather than through a policy,
   so the one-open-request rule and the notification cannot be sidestepped. */

CREATE OR REPLACE FUNCTION public.submit_change_request(_fields text[], _note text DEFAULT NULL)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.change_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;
  IF _fields IS NULL OR array_length(_fields, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one thing to change';
  END IF;

  -- Asking again replaces what was asked before.
  UPDATE public.change_requests
     SET fields = _fields, note = _note, created_at = now()
   WHERE user_id = auth.uid() AND status = 'open'
   RETURNING * INTO r;

  IF NOT FOUND THEN
    INSERT INTO public.change_requests (user_id, fields, note)
    VALUES (auth.uid(), _fields, _note)
    RETURNING * INTO r;
  END IF;

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_change_request(_id uuid, _comment text)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.change_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.change_requests
     SET status = 'done',
         admin_comment = _comment,
         resolved_at = now(),
         resolved_by = auth.uid()
   WHERE id = _id AND status = 'open'
   RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already closed';
  END IF;

  /* The person hears back in the app, the way they do for a reviewed report —
     otherwise the only sign anything happened is their details quietly being
     different. */
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    r.user_id,
    'change_request_done',
    'Your details were updated',
    COALESCE(NULLIF(trim(_comment), ''), 'An admin has updated your account details.'),
    jsonb_build_object('change_request_id', r.id, 'fields', to_jsonb(r.fields))
  );

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_change_request(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_change_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_change_request(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_change_request(uuid, text) TO authenticated;

ALTER TABLE public.change_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'change_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.change_requests;
  END IF;
END $$;
