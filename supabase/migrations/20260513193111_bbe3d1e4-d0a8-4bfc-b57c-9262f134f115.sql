
REVOKE EXECUTE ON FUNCTION public.confirm_order(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_delivered(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivered(UUID) TO authenticated;
