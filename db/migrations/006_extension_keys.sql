-- Migration 006: Extension API Keys (Pro-only Extension Account Link)
-- Idempotent schema definition

CREATE TABLE IF NOT EXISTS public.extension_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    key_hash text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz NULL
);

COMMENT ON
TABLE public.extension_keys IS 'SHA-256 hashed extension API keys linked to user accounts (never stores plain keys)';

CREATE INDEX IF NOT EXISTS idx_extension_keys_user_created ON public.extension_keys (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extension_keys_key_hash ON public.extension_keys (key_hash);

-- Row Level Security
ALTER TABLE public.extension_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own extension keys" ON public.extension_keys;

CREATE POLICY "Users can select own extension keys" ON public.extension_keys FOR
SELECT TO authenticated USING (auth.uid () = user_id);

-- Permissions: service_role has full access, authenticated can only SELECT their own rows
GRANT USAGE ON SCHEMA public TO service_role;

GRANT
SELECT,
INSERT
,
UPDATE,
DELETE ON public.extension_keys TO service_role;

GRANT SELECT ON public.extension_keys TO authenticated;