-- What a marketer has saved, for the admin looking at their account.
--
-- favorites is readable only by the marketer it belongs to, and that is the
-- right default — it is a private list. But an admin reviewing an account has
-- no way to see what that marketer is actually interested in, which is often
-- the question being asked about them.
--
-- So this is a function rather than a policy: a policy would open the table to
-- every admin query, including ones nobody wrote deliberately, while this
-- answers exactly one question and is gated twice. The caller must hold the
-- users page, and the marketer must be inside the caller's countries — the
-- same admin_sees_user() every other scoped admin read goes through, so a
-- Libya-only admin cannot read a Tunisian marketer's list.
--
-- Ordered newest first and capped, like every other admin list: a screen may
-- miss the oldest rows, it may never pull an unbounded set onto a phone.

CREATE OR REPLACE FUNCTION public.admin_list_favorites(_marketer_id uuid, _limit integer DEFAULT 200)
RETURNS TABLE (
  product_id uuid,
  saved_at timestamptz,
  name text,
  code text,
  price numeric,
  currency jsonb,
  photos text[],
  cover_focus_x numeric,
  cover_focus_y numeric,
  status text,
  biz_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.admin_sees_user(_marketer_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT f.product_id,
           f.created_at,
           p.name,
           p.code,
           p.price,
           to_jsonb(p.currency),
           p.photos,
           p.cover_focus_x,
           p.cover_focus_y,
           p.status,
           p.biz_name
      FROM public.favorites f
      JOIN public.products p ON p.id = f.product_id
     WHERE f.marketer_id = _marketer_id
       AND p.deleted_at IS NULL
     ORDER BY f.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 200), 500));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_favorites(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
