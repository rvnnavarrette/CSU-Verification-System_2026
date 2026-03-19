-- ============================================================
-- MIGRATION: Add date_of_verification column
-- CSU Registrar Verification System
-- Date: 2026-03-04
--
-- PURPOSE:
--   Adds the date_of_verification TEXT column that the admin
--   dashboard writes when marking a request as verified or
--   not_verified. Without this column, the "Mark Verified"
--   and "Mark Not Verified" buttons throw a schema cache error.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase → SQL Editor → Run
--   Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.verification_requests
    ADD COLUMN IF NOT EXISTS date_of_verification TEXT;

COMMENT ON COLUMN public.verification_requests.date_of_verification
    IS 'Human-readable date string (e.g. "March 4, 2026") set by the admin when a final decision is recorded.';

-- ============================================================
-- DONE
-- After running this migration:
--   - "Mark Verified" / "Mark Not Verified" buttons will work.
--   - The date_of_verification value will appear in the
--     Review Request card and in the print view.
-- ============================================================
