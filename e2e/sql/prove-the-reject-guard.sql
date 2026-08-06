-- Proof that the reject guard closes the loop, on a real Postgres.
--
-- Run against a throwaway database, not against anything that matters. It
-- builds just enough of the schema for `admin_reject_order_with_notes` to be
-- the real function — the same body, verbatim, from the migration beside it —
-- and then walks the exact sequence the browser tests found:
--
--     deliver → reject → re-upload → approve → paid twice
--
-- once with the function as it was, and once with the guard in place.
--
--   psql -f e2e/sql/prove-the-reject-guard.sql

\set ON_ERROR_STOP on
\set QUIET on

CREATE SCHEMA IF NOT EXISTS scaffold;
SET search_path = public;

-- --------------------------------------------------------------------------
-- Enough schema for the function to be itself
-- --------------------------------------------------------------------------
DROP TABLE IF EXISTS notifications, orders, products, wallets CASCADE;

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, photos text[], cover_focus_x int DEFAULT 50, cover_focus_y int DEFAULT 50,
  fulfilment text, qty int DEFAULT 100, sold int DEFAULT 0, revenue numeric DEFAULT 0,
  unit_price numeric DEFAULT 100, updated_at timestamptz DEFAULT now()
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text, product_id uuid, business_id uuid, marketer_id uuid,
  status text NOT NULL DEFAULT 'pending',
  qty int DEFAULT 1, unit_price numeric DEFAULT 100, commission numeric DEFAULT 10,
  commission_pending boolean DEFAULT false, commission_released_at timestamptz,
  receipt_url text, receipt_uploaded_at timestamptz, reviewed_at timestamptz,
  admin_notes text, business_notes text, delivered_at timestamptz, confirmed_at timestamptz,
  refunded_at timestamptz, refund_note text, refund_reason text,
  size text, color text, selected_variants jsonb DEFAULT '[]'::jsonb,
  customer_name text, customer_phone text, customer_whatsapp text, customer_address text,
  customer_city text, customer_country text, customer_notes text
);

CREATE TABLE wallets (user_id uuid PRIMARY KEY, balance numeric DEFAULT 0, pending numeric DEFAULT 0, updated_at timestamptz);
CREATE TABLE notifications (id bigserial PRIMARY KEY, user_id uuid, kind text, title text, body text, data jsonb);

-- The admin gate, always open here: this file is about the status guard, and
-- the real gate is proved by the browser tests signing in as a real admin.
CREATE OR REPLACE FUNCTION admin_can(_page text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

-- --------------------------------------------------------------------------
-- The three functions the loop goes through, as they are in production
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_approve_order(_order_id uuid) RETURNS orders
LANGUAGE plpgsql AS $$
DECLARE o orders; amt numeric;
BEGIN
  IF NOT admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;
  UPDATE orders SET status = 'approved', reviewed_at = now(), commission_pending = true
    WHERE id = _order_id RETURNING * INTO o;
  amt := o.commission * o.qty;
  INSERT INTO wallets (user_id, balance, pending) VALUES (o.marketer_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE wallets SET pending = COALESCE(pending,0) + amt WHERE user_id = o.marketer_id;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION mark_delivered(_order_id uuid) RETURNS orders
LANGUAGE plpgsql AS $$
DECLARE o orders;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Order is not confirmed'; END IF;
  UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION marketer_reupload_receipt(_order_id uuid, _receipt_url text) RETURNS orders
LANGUAGE plpgsql AS $$
DECLARE o orders;
BEGIN
  IF _receipt_url IS NULL OR length(trim(_receipt_url)) = 0 THEN RAISE EXCEPTION 'Receipt URL required'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status NOT IN ('rejected','pending') THEN RAISE EXCEPTION 'Cannot re-upload receipt for order in status %', o.status; END IF;
  UPDATE orders SET receipt_url = _receipt_url, receipt_uploaded_at = now(), status = 'pending',
                    admin_notes = NULL, reviewed_at = NULL
    WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END $$;

-- --------------------------------------------------------------------------
-- The one under test, first as it was
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reject_order_with_notes(_order_id uuid, _notes text) RETURNS orders
LANGUAGE plpgsql AS $$
DECLARE o orders; p products; photo text; receipt text;
BEGIN
  IF NOT admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT receipt_url INTO receipt FROM orders WHERE id = _order_id;
  UPDATE orders SET status = 'rejected', admin_notes = _notes, reviewed_at = now()
    WHERE id = _order_id RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT * INTO p FROM products WHERE id = o.product_id;
  INSERT INTO notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'receipt_rejected', 'Receipt rejected by the admin', COALESCE(_notes,''), '{}'::jsonb);
  RETURN o;
END $$;

-- --------------------------------------------------------------------------
-- The walk
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION scaffold.run_the_loop(_label text, _turns int) RETURNS TABLE(label text, pending numeric, sold int, status text)
LANGUAGE plpgsql AS $$
DECLARE mkt uuid := gen_random_uuid(); biz uuid := gen_random_uuid();
        pid uuid; oid uuid; i int;
BEGIN
  INSERT INTO products (name, qty) VALUES ('scaffold blanket', 100) RETURNING id INTO pid;
  INSERT INTO orders (product_id, business_id, marketer_id, qty, unit_price, commission, receipt_url, status)
    VALUES (pid, biz, mkt, 2, 100, 10, 'receipts:one.jpg', 'pending') RETURNING id INTO oid;

  PERFORM admin_approve_order(oid);
  UPDATE orders SET status = 'confirmed', confirmed_at = now() WHERE id = oid;
  PERFORM mark_delivered(oid);

  FOR i IN 1.._turns LOOP
    BEGIN
      PERFORM admin_reject_order_with_notes(oid, 'turn ' || i);
      PERFORM marketer_reupload_receipt(oid, 'receipts:turn' || i || '.jpg');
      PERFORM admin_approve_order(oid);
    EXCEPTION WHEN others THEN
      -- The guard fired. That is the point; stop going round.
      EXIT;
    END;
  END LOOP;

  RETURN QUERY
    SELECT _label,
           (SELECT w.pending FROM wallets w WHERE w.user_id = mkt),
           (SELECT p.sold FROM products p WHERE p.id = pid),
           (SELECT o.status FROM orders o WHERE o.id = oid);
END $$;

\set QUIET off
\echo ''
\echo '=== One order, commission 10 x qty 2 = 20. Anything above 20 is money invented. ==='
\echo ''
\echo '--- BEFORE: no status guard on reject ---'
SELECT * FROM scaffold.run_the_loop('1 turn  round the loop', 1);
SELECT * FROM scaffold.run_the_loop('5 turns round the loop', 5);
SELECT * FROM scaffold.run_the_loop('20 turns round the loop', 20);

-- --------------------------------------------------------------------------
-- Now with the guard, exactly as the migration writes it
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reject_order_with_notes(_order_id uuid, _notes text) RETURNS orders
LANGUAGE plpgsql AS $$
DECLARE o orders; p products; photo text; receipt text;
BEGIN
  IF NOT admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;
  receipt := o.receipt_url;
  UPDATE orders SET status = 'rejected', admin_notes = _notes, reviewed_at = now()
    WHERE id = _order_id RETURNING * INTO o;
  SELECT * INTO p FROM products WHERE id = o.product_id;
  INSERT INTO notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'receipt_rejected', 'Receipt rejected by the admin', COALESCE(_notes,''), '{}'::jsonb);
  RETURN o;
END $$;

\echo ''
\echo '--- AFTER: reject only accepts a pending order ---'
SELECT * FROM scaffold.run_the_loop('1 turn  round the loop', 1);
SELECT * FROM scaffold.run_the_loop('5 turns round the loop', 5);
SELECT * FROM scaffold.run_the_loop('20 turns round the loop', 20);

\echo ''
\echo '--- and a pending receipt can still be rejected, which is the job ---'
DO $$
DECLARE pid uuid; oid uuid; st text;
BEGIN
  INSERT INTO products (name) VALUES ('still works') RETURNING id INTO pid;
  INSERT INTO orders (product_id, business_id, marketer_id, qty, commission, receipt_url, status)
    VALUES (pid, gen_random_uuid(), gen_random_uuid(), 1, 10, 'receipts:x.jpg', 'pending') RETURNING id INTO oid;
  PERFORM admin_reject_order_with_notes(oid, 'blurry photo');
  SELECT status INTO st FROM orders WHERE id = oid;
  IF st <> 'rejected' THEN RAISE EXCEPTION 'a pending receipt should still be rejectable, got %', st; END IF;
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE body = 'blurry photo') THEN
    RAISE EXCEPTION 'the marketer was not told';
  END IF;
  RAISE NOTICE 'pending -> rejected still works, and the marketer is still told';
END $$;
