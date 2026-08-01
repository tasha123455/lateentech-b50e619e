-- "Active users" on the admin home was a 30-day count derived from orders: it
-- counted anyone who had placed or received an order in the last month, which
-- is not what the word active suggests. It now means what it says — people
-- signed in and inside their account right now.
--
-- Two tables. user_presence is one row per user, stamped by a heartbeat while
-- a dashboard is open, and answers "who is here now". presence_daily keeps the
-- day's high-water mark, so a date filter can answer "the most people that
-- were here at once that day" — a peak cannot be recovered after the fact, so
-- it has to be recorded as it happens.

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx
  ON public.user_presence (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.presence_daily (
  day date PRIMARY KEY,
  peak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence_daily ENABLE ROW LEVEL SECURITY;

-- No direct access: everything goes through the two functions below, so a
-- client can neither read who else is online nor forge someone else's row.
-- Dropped first so the whole file can be re-run: everything else here is
-- CREATE OR REPLACE or IF NOT EXISTS, and these two policies were the only
-- statements that would have failed on a second pass.
DROP POLICY IF EXISTS "Admins read presence" ON public.user_presence;
CREATE POLICY "Admins read presence" ON public.user_presence
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins read presence daily" ON public.presence_daily;
CREATE POLICY "Admins read presence daily" ON public.presence_daily
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Someone is "here" if their dashboard checked in within the last two minutes.
-- The heartbeat runs every 60s, so one missed beat is forgiven.
CREATE OR REPLACE FUNCTION public.live_user_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.user_presence
  WHERE last_seen_at > now() - interval '2 minutes';
$$;

/* Called by every open dashboard on a timer. Stamps the caller and rolls the
   day's peak forward in the same round trip, so the high-water mark is kept
   without a cron job. */
CREATE OR REPLACE FUNCTION public.touch_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  live integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_presence (user_id, last_seen_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now();

  live := public.live_user_count();

  INSERT INTO public.presence_daily (day, peak, updated_at)
  VALUES (current_date, live, now())
  ON CONFLICT (day) DO UPDATE
    SET peak = GREATEST(public.presence_daily.peak, EXCLUDED.peak),
        updated_at = now();
END;
$$;

/* Admin home. With no day, the live count right now; with a day, the most
   people that were on at once that day. */
CREATE OR REPLACE FUNCTION public.admin_presence_stats(_day date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _day IS NULL THEN
    RETURN public.live_user_count();
  END IF;
  RETURN COALESCE((SELECT peak FROM public.presence_daily WHERE day = _day), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.touch_presence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_presence_stats(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_user_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_presence() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_presence_stats(date) TO authenticated;
