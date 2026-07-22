-- Previously employee_payments.employee_id was ON DELETE CASCADE, so deleting
-- an employee silently deleted their paid-salary history too. Since total
-- platform profit is calculated as platform fees minus employee salaries paid,
-- that meant deleting an employee would wrongly bump total profit back up by
-- whatever had already been paid to them.
--
-- Now the row survives the employee being deleted (employee_id becomes NULL
-- instead of the row disappearing), so historical paid salaries keep counting
-- against total profit forever, exactly as they did before the employee was
-- removed.
ALTER TABLE public.employee_payments ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.employee_payments DROP CONSTRAINT IF EXISTS employee_payments_employee_id_fkey;
ALTER TABLE public.employee_payments
  ADD CONSTRAINT employee_payments_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
