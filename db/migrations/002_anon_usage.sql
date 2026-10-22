-- Table anon_usage: anonymous free-scan usage tracking by hashed cookie and salted hashed IP
CREATE TABLE IF NOT EXISTS public.anon_usage (
    id_hash text primary key,
    ip_hash text not null,
    count int not null default 0,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now()
);

COMMENT ON TABLE public.anon_usage IS 'Anonymous free-scan usage tracking by hashed cookie and salted hashed IP';

CREATE INDEX IF NOT EXISTS idx_anon_usage_ip_hash ON public.anon_usage (ip_hash);
CREATE INDEX IF NOT EXISTS idx_anon_usage_last_seen ON public.anon_usage (last_seen);

-- Enable Row Level Security
ALTER TABLE public.anon_usage ENABLE ROW LEVEL SECURITY;

-- No policies for anon or authenticated (only service_role has access)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anon_usage TO service_role;

