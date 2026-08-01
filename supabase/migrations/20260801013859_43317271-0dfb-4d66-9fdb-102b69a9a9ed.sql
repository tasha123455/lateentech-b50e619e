-- Employees now carry two phone numbers, and they have to be different ones —
-- the point of the second is to reach the person when the first does not
-- answer, so a duplicate would be worse than useless. The form enforces it and
-- so does this constraint, since the form is not the only way in.
--
-- `phone` already exists; only the second column is new.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone2 text;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_phones_differ;
ALTER TABLE public.employees ADD CONSTRAINT employees_phones_differ
  CHECK (
    phone IS NULL
    OR phone2 IS NULL
    -- Compare digits only: "+218 91 234" and "+21891234" are the same number.
    OR regexp_replace(phone, '\D', '', 'g') <> regexp_replace(phone2, '\D', '', 'g')
  );

COMMENT ON COLUMN public.employees.phone2 IS 'Second contact number, required to differ from phone.';