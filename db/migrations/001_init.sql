-- Table profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text,
    avatar_url text,
    plan text not null default 'free',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

COMMENT ON TABLE public.profiles IS 'User profile metadata and subscription plan';

-- Trigger on auth.users insert that creates the profile row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw_name text;
  clean_name text;
BEGIN
  raw_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), '')
  );
  clean_name := CASE
    WHEN raw_name IS NOT NULL THEN LEFT(BTRIM(raw_name), 60)
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    clean_name,
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing profiles with an empty display_name from raw_user_meta_data (full_name, else name), never from email
UPDATE public.profiles p
SET
  display_name = LEFT(
    BTRIM(
      COALESCE(
        NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), '')
      )
    ),
    60
  ),
  updated_at = now()
FROM auth.users u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR BTRIM(p.display_name) = '')
  AND COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), '')
  ) IS NOT NULL;

-- Table scans
CREATE TABLE IF NOT EXISTS public.scans (
    id uuid primary key default gen_random_uuid (),
    created_at timestamptz default now(),
    user_id uuid null references auth.users (id) on delete cascade,
    proof_id text unique not null,
    proof_key text not null,
    level text not null check (
        level in (
            'low',
            'medium',
            'high',
            'unknown'
        )
    ),
    score int null,
    confidence int null,
    report jsonb not null,
    limited_evidence boolean default false,
    expires_at timestamptz null
);

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS user_id uuid null references auth.users (id) on delete cascade;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scans_user_id_fkey'
      AND conrelid = 'public.scans'::regclass
      AND confdeltype <> 'c'
  ) THEN
    ALTER TABLE public.scans DROP CONSTRAINT scans_user_id_fkey;
    ALTER TABLE public.scans
      ADD CONSTRAINT scans_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.scans IS 'User scans and risk reports';

CREATE INDEX IF NOT EXISTS idx_scans_user_id ON public.scans (user_id);

CREATE INDEX IF NOT EXISTS idx_scans_user_id_created_at ON public.scans (user_id, created_at desc);

CREATE INDEX IF NOT EXISTS idx_scans_expires_at ON public.scans (expires_at);

-- Table ledger_blocks
CREATE TABLE IF NOT EXISTS public.ledger_blocks (
    idx bigint primary key,
    created_at timestamptz not null,
    report_hash text not null,
    prev_hash text not null unique,
    nonce bigint not null,
    hash text not null unique,
    proof_key text,
    sections jsonb,
    meta jsonb,
    tx_hash text
);

COMMENT ON
TABLE public.ledger_blocks IS 'Append-only ledger of scans for verifiable history';

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_blocks ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
DROP POLICY IF EXISTS select_own_profile ON public.profiles;

CREATE POLICY select_own_profile ON public.profiles FOR
SELECT TO authenticated USING (
        id = (
            select auth.uid ()
        )
    );

DROP POLICY IF EXISTS update_own_profile ON public.profiles;

CREATE POLICY update_own_profile ON public.profiles FOR
UPDATE TO authenticated USING (
        id = (
            select auth.uid ()
        )
    )
    WITH CHECK (
        id = (
            select auth.uid ()
        )
    );

-- Policies for scans
DROP POLICY IF EXISTS select_own_scans ON public.scans;

CREATE POLICY select_own_scans ON public.scans FOR
SELECT TO authenticated USING (
        user_id = (
            select auth.uid ()
        )
    );

DROP POLICY IF EXISTS delete_own_scans ON public.scans;

CREATE POLICY delete_own_scans ON public.scans FOR DELETE TO authenticated USING (
    user_id = (
        select auth.uid ()
    )
);

-- Trigger to reject DELETE and reject UPDATE of every column except tx_hash on ledger_blocks
CREATE OR REPLACE FUNCTION protect_ledger_blocks() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Deleting ledger blocks is forbidden';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.idx IS DISTINCT FROM OLD.idx OR 
       NEW.created_at IS DISTINCT FROM OLD.created_at OR 
       NEW.report_hash IS DISTINCT FROM OLD.report_hash OR 
       NEW.prev_hash IS DISTINCT FROM OLD.prev_hash OR 
       NEW.nonce IS DISTINCT FROM OLD.nonce OR 
       NEW.hash IS DISTINCT FROM OLD.hash OR 
       NEW.proof_key IS DISTINCT FROM OLD.proof_key OR 
       NEW.sections IS DISTINCT FROM OLD.sections OR 
       NEW.meta IS DISTINCT FROM OLD.meta THEN
      RAISE EXCEPTION 'Updating ledger block columns other than tx_hash is forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_ledger_blocks') THEN
    CREATE TRIGGER trg_protect_ledger_blocks
    BEFORE UPDATE OR DELETE ON public.ledger_blocks
    FOR EACH ROW EXECUTE FUNCTION protect_ledger_blocks();
  END IF;
END $$;

-- Statement-level BEFORE TRUNCATE trigger on public.ledger_blocks
CREATE OR REPLACE FUNCTION reject_truncate_ledger_blocks() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Truncating ledger blocks is forbidden';
END;
$$ LANGUAGE plpgsql SET search_path = '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reject_truncate_ledger_blocks') THEN
    CREATE TRIGGER trg_reject_truncate_ledger_blocks
    BEFORE TRUNCATE ON public.ledger_blocks
    FOR EACH STATEMENT EXECUTE FUNCTION reject_truncate_ledger_blocks();
  END IF;
END $$;

-- Grants are needed because "automatically expose new tables" is turned off
GRANT USAGE ON SCHEMA public TO service_role;

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.ledger_blocks TO service_role;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;

GRANT SELECT, DELETE ON public.scans TO authenticated;