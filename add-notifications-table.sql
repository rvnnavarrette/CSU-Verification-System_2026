-- =============================================================================
-- Notifications table — server-side, multi-device synced notifications
-- Replaces localStorage-based notifications in js/user-dashboard.js
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_id  UUID REFERENCES verification_requests(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('success', 'danger', 'info')),
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id) WHERE read = FALSE;

-- =============================================================================
-- Row-Level Security
-- =============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_delete_own" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

-- INSERT is intentionally NOT exposed to the user role — notifications must
-- only originate from the trigger below (which runs as table owner / SECURITY DEFINER).

-- =============================================================================
-- Trigger: auto-create a notification whenever a request's status changes
-- Runs on every UPDATE to verification_requests.status.
-- =============================================================================
CREATE OR REPLACE FUNCTION notify_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    short_degree TEXT;
    notif_type   TEXT;
    notif_title  TEXT;
    notif_msg    TEXT;
BEGIN
    -- Only fire when status actually changed
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    short_degree := COALESCE(NULLIF(NEW.degree_diploma, ''), 'your request');
    IF length(short_degree) > 35 THEN
        short_degree := substring(short_degree FROM 1 FOR 35) || '…';
    END IF;

    IF NEW.status = 'verified' THEN
        notif_type  := 'success';
        notif_title := 'Request Verified';
        notif_msg   := 'Your verification request for ' || short_degree || ' has been approved.';
    ELSIF NEW.status = 'not_verified' THEN
        notif_type  := 'danger';
        notif_title := 'Request Not Verified';
        notif_msg   := 'Your verification request for ' || short_degree || ' was not verified. View for details.';
    ELSIF NEW.status = 'under_review' THEN
        notif_type  := 'info';
        notif_title := 'Under Review';
        notif_msg   := 'Your request for ' || short_degree || ' is now being reviewed by the Registrar''s Office.';
    ELSE
        -- Unknown / pending — skip
        RETURN NEW;
    END IF;

    INSERT INTO notifications (user_id, request_id, type, title, message)
    VALUES (NEW.user_id, NEW.id, notif_type, notif_title, notif_msg);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_status_change ON verification_requests;
CREATE TRIGGER trg_notify_request_status_change
AFTER UPDATE OF status ON verification_requests
FOR EACH ROW
EXECUTE FUNCTION notify_request_status_change();

-- =============================================================================
-- Trigger: confirmation notification when the user submits a new request.
-- Persists in the bell so the user has a record beyond the 5-second toast.
-- =============================================================================
CREATE OR REPLACE FUNCTION notify_request_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    short_degree TEXT;
BEGIN
    short_degree := COALESCE(NULLIF(NEW.degree_diploma, ''), 'your request');
    IF length(short_degree) > 35 THEN
        short_degree := substring(short_degree FROM 1 FOR 35) || '…';
    END IF;

    INSERT INTO notifications (user_id, request_id, type, title, message)
    VALUES (
        NEW.user_id,
        NEW.id,
        'info',
        'Request Submitted',
        'Your verification request for ' || short_degree || ' was received. Expected response within 3–5 business days.'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_submitted ON verification_requests;
CREATE TRIGGER trg_notify_request_submitted
AFTER INSERT ON verification_requests
FOR EACH ROW
EXECUTE FUNCTION notify_request_submitted();

-- =============================================================================
-- Enable Realtime on the notifications table so the client gets pushes.
-- Idempotent: only adds the table if it isn't already in the publication.
-- (Otherwise Postgres errors with 42710 "already member of publication".)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_publication_tables
        WHERE  pubname    = 'supabase_realtime'
          AND  schemaname = 'public'
          AND  tablename  = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
END $$;
