-- Table waitlist: email signups for upcoming Pro and Teams tiers
CREATE TABLE IF NOT EXISTS public.waitlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL,
    plan text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_email_plan_key UNIQUE (email, plan)
);

COMMENT ON TABLE public.waitlist IS 'Email signups for Pro and Teams tier waitlists';

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone may INSERT into waitlist (anon and authenticated)
CREATE POLICY "Anyone may insert into waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Nobody may SELECT from the browser: No SELECT policy granted to anon or authenticated.
-- Service role retains full access for administrative exports.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT ON public.waitlist TO anon, authenticated;
GRANT ALL ON public.waitlist TO service_role;

