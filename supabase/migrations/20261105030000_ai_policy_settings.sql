-- Aimee rules, per platform (2026-11-05).
--
-- One editable switch per platform: whether Aimee may describe the general
-- labeled use and standard titration of FDA-approved prescription drugs, cited
-- to the prescribing information (supabase/functions/_shared/rxPolicy.ts).
-- Research-compound protocols and personalised dosing are not switches — they
-- are fixed off in code and shown locked on the admin page.
--
-- Read by aimee-chat-stream and aimee-chat (60s cache). A missing table or row
-- makes them use the code defaults (iOS off, Android and web on), so the functions can be
-- deployed before this migration.
--
-- Edited only from peptalk.bio/admin (service role). RLS on, no policies: no
-- client can read or write it.
--
-- Reversible: DROP TABLE IF EXISTS public.ai_policy_settings;

CREATE TABLE IF NOT EXISTS public.ai_policy_settings (
  platform TEXT PRIMARY KEY CHECK (platform IN ('ios', 'android', 'web')),
  approved_rx_label_info BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_policy_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_policy_settings FROM anon, authenticated;

INSERT INTO public.ai_policy_settings (platform, approved_rx_label_info, updated_by)
VALUES ('ios', false, 'migration'), ('android', true, 'migration'), ('web', true, 'migration')
ON CONFLICT (platform) DO NOTHING;
