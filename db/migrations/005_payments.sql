-- Migration 005: Payment Orders (Razorpay Integration)
-- Idempotent schema definition

CREATE TABLE IF NOT EXISTS public.payment_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    razorpay_order_id text UNIQUE NOT NULL,
    razorpay_payment_id text NULL,
    amount_paise int NOT NULL,
    currency text NOT NULL DEFAULT 'INR',
    status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz NULL
);

COMMENT ON TABLE public.payment_orders IS 'Payment orders and status tracking for Razorpay transactions';

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON public.payment_orders (user_id, created_at);

-- Row Level Security
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own payment orders" ON public.payment_orders;
CREATE POLICY "Users can select own payment orders"
    ON public.payment_orders
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Permissions: service_role has full access, authenticated can only SELECT their own rows
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_orders TO service_role;
GRANT SELECT ON public.payment_orders TO authenticated;

