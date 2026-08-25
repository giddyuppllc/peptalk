-- ============================================================================
-- Personal details on the customer profile.
--
-- profiles held only identity-for-login (email, first/last name, username,
-- avatar). This adds the contact and identity fields a customer expects to see
-- and edit in their own account: phone, date of birth, and a postal address.
--
-- ⚠️ DECLARATION IMPACT — these are new categories of collected personal data.
-- Apple App Privacy and Google Data safety must both be updated BEFORE the next
-- submission. Shipping new PII collection against stale declarations is a
-- misdeclaration, which is the same class of problem as answering "no" to
-- user-generated content while shipping a community.
--
-- Specifically newly collected: phone number, physical address, date of birth.
-- Data safety additionally needs each marked as collected/shared, whether it is
-- linked to identity, and whether the user can request deletion (they can —
-- delete-user removes the profile row).
--
-- DATE OF BIRTH AND THE AGE GATE
-- Stored separately from age_range rather than replacing it. age_range plus
-- age_gate_min record what the user attested and what the app enforced AT
-- SIGNUP, which is the proof an age gate needs. date_of_birth is a profile
-- field the user may add, change, or leave blank later. Deriving the gate from
-- an editable field would mean a user could retroactively invalidate their own
-- attestation.
--
-- All nullable. Every field here is optional to supply — an account must remain
-- fully usable without an address, and nothing in the app should gate on these
-- unless Edward says so.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS phone, DROP COLUMN IF EXISTS date_of_birth,
--     DROP COLUMN IF EXISTS address_line1, DROP COLUMN IF EXISTS address_line2,
--     DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS region,
--     DROP COLUMN IF EXISTS postal_code, DROP COLUMN IF EXISTS country;
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS city          TEXT,
  ADD COLUMN IF NOT EXISTS region        TEXT,
  ADD COLUMN IF NOT EXISTS postal_code   TEXT,
  ADD COLUMN IF NOT EXISTS country       TEXT;

COMMENT ON COLUMN public.profiles.date_of_birth IS
  'Optional, user-supplied. NOT the age gate — see age_range / age_gate_min, which record the attestation made at signup and must not be derived from an editable field.';
COMMENT ON COLUMN public.profiles.phone IS
  'Optional contact number. Newly collected PII — must be reflected in Apple App Privacy and Google Data safety.';
COMMENT ON COLUMN public.profiles.address_line1 IS
  'Optional postal address. Newly collected PII — must be reflected in Apple App Privacy and Google Data safety.';
