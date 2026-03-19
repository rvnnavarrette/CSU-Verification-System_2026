-- ============================================================
-- MIGRATION: Add verifier_name and verifier_designation columns
-- CSU Registrar Verification System
-- Date: 2026-03-04
--
-- PURPOSE:
--   The admin "Confirm — Verified" button writes verifier_name
--   and verifier_designation to the row when marking a request
--   as verified. These columns did not exist in the schema,
--   causing: "Could not find the 'verifier_designation' column
--   of 'verification_requests' in the schema cache"
--
-- HOW TO RUN:
--   Paste this entire file into Supabase → SQL Editor → Run
--   Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.verification_requests
    ADD COLUMN IF NOT EXISTS verifier_name TEXT;

ALTER TABLE public.verification_requests
    ADD COLUMN IF NOT EXISTS verifier_designation TEXT;

COMMENT ON COLUMN public.verification_requests.verifier_name
    IS 'Full name of the registrar staff who marked the request as verified.';

COMMENT ON COLUMN public.verification_requests.verifier_designation
    IS 'Job title/designation of the staff member who verified the request (e.g. "University Registrar").';

-- ===========================================================
-- DONE
-- After running this migration:
--   - "Confirm — Verified" button will save without errors.
--   - verifier_name and verifier_designation will appear in
--     the Review Request card and in the printed letter.
-- ============================================================
