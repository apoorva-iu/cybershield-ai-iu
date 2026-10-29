-- Migration 004: Usage Events and User Plans
-- Replaces anon_usage table from 002_anon_usage.sql
-- Idempotent schema definition

-- 1. Table usage_events: records individual tool checks
CREATE TABLE IF NOT EXISTS public.usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    anon_key_hash text NULL,
    tool text NOT NULL CHECK (
        tool IN ('job', 'upi', 'message')
    ),
    source text NOT NULL DEFAULT 'web' CHECK (
        source IN ('web', 'extension')
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usage_events_identity_check CHECK (
        (
            user_id IS NOT NULL
            AND anon_key_hash IS NULL
        )
        OR (
            user_id IS NULL
            AND anon_key_hash IS NOT NULL
        )
    )
);

COMMENT ON
TABLE public.usage_events IS 'Per-check usage tracking across job, upi, and message screening tools';

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON public.usage_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_anon_created ON public.usage_events (anon_key_hash, created_at);

-- 2. Table user_plans: records user plan tier and active pass validity
CREATE TABLE IF NOT EXISTS public.user_plans (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    started_at timestamptz NULL,
    expires_at timestamptz NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON
TABLE public.user_plans IS 'User plan tier and active pass validity periods';

-- 3. Row Level Security
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own usage events" ON public.usage_events;

CREATE POLICY "Users can select own usage events" ON public.usage_events FOR
SELECT TO authenticated USING (auth.uid () = user_id);

DROP POLICY IF EXISTS "Users can select own plan" ON public.user_plans;

CREATE POLICY "Users can select own plan" ON public.user_plans FOR
SELECT TO authenticated USING (auth.uid () = user_id);

-- Only service_role can INSERT, UPDATE, or DELETE
GRANT USAGE ON SCHEMA public TO service_role;

GRANT
SELECT,
INSERT
,
UPDATE,
DELETE ON public.usage_events TO service_role;

GRANT
SELECT,
INSERT
,
UPDATE,
DELETE ON public.user_plans TO service_role;

GRANT SELECT ON public.usage_events TO authenticated;

GRANT SELECT ON public.user_plans TO authenticated;