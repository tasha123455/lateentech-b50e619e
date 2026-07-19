ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique ON public.orders (order_number);