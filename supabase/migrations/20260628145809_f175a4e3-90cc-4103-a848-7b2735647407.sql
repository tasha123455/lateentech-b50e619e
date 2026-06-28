REVOKE ALL ON FUNCTION public.request_payout(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_payout(numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric) TO service_role;

REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_note_payout(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_note_payout(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_note_payout(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_note_payout(uuid, text) TO service_role;