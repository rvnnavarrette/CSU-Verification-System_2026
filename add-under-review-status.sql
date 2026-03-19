-- ============================================================
-- MIGRATION: Add "under_review" status to verification_requests
-- CSU Registrar Verification System
-- Date: 2026-03-04
--
-- PURPOSE:
--   Introduces a real "under_review" status value so the admin
--   dashboard can signal to the user that their request is being
--   actively reviewed. This enables true real-time status tracking
--   via Supabase Realtime on the user dashboard.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase → SQL Editor → Run
--   Safe to run on an existing database — uses IF EXISTS guards.
--
-- STATUS FLOW (after migration):
--   pending → under_review → verified
--                          → not_verified
-- ============================================================


-- ============================================================
-- STEP 1: Update the status CHECK constraint
-- Drops the old 3-value constraint and replaces it with one
-- that also allows 'under_review'.
-- ============================================================

ALTER TABLE public.verification_requests
    DROP CONSTRAINT IF EXISTS verification_requests_status_check;

ALTER TABLE public.verification_requests
    ADD CONSTRAINT verification_requests_status_check
    CHECK (status IN ('pending', 'under_review', 'verified', 'not_verified'));


-- ============================================================
-- STEP 2: Update the reviewed_at trigger
-- The previous trigger fired when status changed FROM 'pending'
-- to anything — including 'under_review'. We only want reviewed_at
-- stamped when a FINAL decision (verified / not_verified) is made.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_reviewed_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Only stamp reviewed_at on a final decision, not on under_review
    IF NEW.status IN ('verified', 'not_verified')
       AND OLD.status NOT IN ('verified', 'not_verified') THEN
        NEW.reviewed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is already attached from the original schema — no need to recreate.
-- But drop + recreate defensively in case the function body changed:
DROP TRIGGER IF EXISTS trg_vr_reviewed_at ON public.verification_requests;
CREATE TRIGGER trg_vr_reviewed_at
    BEFORE UPDATE ON public.verification_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_reviewed_at();


-- ============================================================
-- STEP 3: Enable REPLICA IDENTITY FULL on verification_requests
--
-- Required for Supabase Realtime column-level filters to work
-- correctly. Without this, the filter `user_id=eq.<uuid>` on
-- the user-side channel may not narrow broadcasts properly,
-- because Postgres only exposes the primary key in WAL by default.
--
-- Setting FULL exposes all column values in the WAL event,
-- allowing Supabase Realtime to filter by any column.
-- ============================================================

ALTER TABLE public.verification_requests REPLICA IDENTITY FULL;


-- ============================================================
-- STEP 4: Update the v_all_requests view (optional — adds
-- under_review to the status column comment for documentation)
-- ============================================================

COMMENT ON COLUMN public.verification_requests.status
    IS '"pending" = awaiting review, "under_review" = admin actively reviewing, "verified" = approved, "not_verified" = rejected.';


-- ============================================================
-- DONE
-- After running this migration, deploy the updated JS files:
--   - js/admin-dashboard.js  (markUnderReview function)
--   - js/user-dashboard.js   (subscribeToMyRequests, realtime handler)
-- ============================================================
