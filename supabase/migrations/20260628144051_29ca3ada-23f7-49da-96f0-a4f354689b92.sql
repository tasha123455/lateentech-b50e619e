REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;