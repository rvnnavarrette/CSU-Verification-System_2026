-- ============================================================
-- MIGRATION: Add verification_code column + public lookup policy
-- CSU Registrar Verification System
-- Date: 2026-03-21
--
-- PURPOSE:
--   Enables the public verify.html page to look up verified
--   documents by a unique 8-character alphanumeric code that
--   is auto-generated when an admin marks a request as "verified".
--
-- HOW TO RUN:
--   Paste this entire file into Supabase → SQL Editor → Run
--   Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================


-- ============================================================
-- STEP 1: Add the verification_code column
-- ============================================================

ALTER TABLE public.verification_requests
    ADD COLUMN IF NOT EXISTS verification_code TEXT UNIQUE;

COMMENT ON COLUMN public.verification_requests.verification_code
    IS 'Auto-generated 8-char alphanumeric code assigned when status = ''verified''. Used for public lookup.';


-- ============================================================
-- STEP 2: Auto-generate verification_code on status = 'verified'
-- The trigger fires BEFORE UPDATE and sets the code only once
-- (when transitioning to verified and code is not yet set).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_verification_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'verified'
       AND (OLD.status IS DISTINCT FROM 'verified')
       AND NEW.verification_code IS NULL
    THEN
        -- Generate a unique 8-char uppercase alphanumeric code
        NEW.verification_code :=
            upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vr_verification_code ON public.verification_requests;
CREATE TRIGGER trg_vr_verification_code
    BEFORE UPDATE ON public.verification_requests
    FOR EACH ROW EXECUTE FUNCTION public.generate_verification_code();


-- ============================================================
-- STEP 3: RLS policy — allow public (anon) lookup of verified rows
-- The anon role can SELECT rows only where:
--   - status = 'verified'
--   - verification_code IS NOT NULL
-- This means unauthenticated users on verify.html can query
-- by code but will never see pending or not_verified rows.
-- ============================================================

DROP POLICY IF EXISTS "requests: public verify lookup" ON public.verification_requests;

CREATE POLICY "requests: public verify lookup"
    ON public.verification_requests FOR SELECT
    USING (
        status = 'verified'
        AND verification_code IS NOT NULL
    );


-- ============================================================
-- STEP 4: Backfill — generate codes for already-verified rows
-- that don't have one yet.
-- ============================================================

UPDATE public.verification_requests
SET verification_code =
        upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE status = 'verified'
  AND verification_code IS NULL;


-- ============================================================
-- DONE
-- After running this migration:
--   - All newly verified requests will get an auto-generated code.
--   - Existing verified rows are backfilled with a code.
--   - verify.html can look up codes without authentication.
-- ============================================================
