-- Where the account holder is.
--
-- The platform runs in one country, so `country` has never told anyone
-- anything they did not already know, and there was nowhere on a profile to
-- record the city. Registration and the profile sheet both ask for it now, so
-- it needs a column to land in.
--
-- Nullable on purpose: every account that already exists has no answer, and a
-- profile with a blank city has to keep working exactly as it does today.
-- The value stored is the city's English name, the same key that orders and
-- product delivery zones already use, so the three can be compared.
--
-- No policy work: "Users update own profile" is column-agnostic, so the owner
-- can already write this and nobody else can.
alter table public.profiles
  add column if not exists city text;

comment on column public.profiles.city is
  'City of the account holder, stored as the English name used by LIBYA_CITIES.';
