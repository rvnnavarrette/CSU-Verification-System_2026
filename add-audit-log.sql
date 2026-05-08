-- ============================================================
-- MIGRATION: Add audit_log table
-- CSU Registrar Verification System
-- Date: 2026-03-21
--
-- PURPOSE:
--   Records every status change and key admin action with a
--   timestamp and the admin's identity. Required for academic
--   records accountability and to satisfy any audit requirement.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase → SQL Editor → Run
--   Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================


-- ============================================================
-- STEP 1: Create the audit_log table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID        REFERENCES public.verification_requests(id) ON DELETE SET NULL,
    changed_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    action          TEXT        NOT NULL,     -- e.g. 'status_changed', 'assessment_updated'
    old_value       JSONB,                    -- snapshot of old values
    new_value       JSONB,                    -- snapshot of new values
    note            TEXT,                     -- optional human-readable note
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_al_request_id ON public.audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_al_changed_by ON public.audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_al_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_action     ON public.audit_log(action);

COMMENT ON TABLE  public.audit_log              IS 'Immutable log of all admin actions on verification requests.';
COMMENT ON COLUMN public.audit_log.action       IS 'Action type: status_changed | assessment_updated | request_deleted | request_cancelled';
COMMENT ON COLUMN public.audit_log.old_value    IS 'JSON snapshot of the field(s) before the change.';
COMMENT ON COLUMN public.audit_log.new_value    IS 'JSON snapshot of the field(s) after the change.';


-- ============================================================
-- STEP 2: RLS — admins can read all audit logs; users cannot
-- ============================================================

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log: admin read all" ON public.audit_log;
CREATE POLICY "audit_log: admin read all"
    ON public.audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "audit_log: admin insert" ON public.audit_log;
CREATE POLICY "audit_log: admin insert"
    ON public.audit_log FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- No UPDATE or DELETE on audit_log — it is append-only.
-- (No policies for UPDATE/DELETE = denied by default under RLS)


-- ============================================================
-- DONE
-- After running this migration:
--   - audit_log table is ready to receive inserts from the app.
--   - In admin-dashboard.js, insert a row into audit_log
--     whenever an admin changes a request's status:
--
--   await supabaseClient.from('audit_log').insert({
--       request_id: requestId,
--       changed_by: currentUserId,
--       action: 'status_changed',
--       old_value: { status: oldStatus },
--       new_value: { status: newStatus },
--       note: `Marked as ${newStatus} by admin`
--   });
-- ============================================================
