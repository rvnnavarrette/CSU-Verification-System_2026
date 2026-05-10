-- =============================================================================
-- Allow each authenticated user to UPDATE their own row in `users`.
-- Required by the Profile / Settings page (saveProfile() in user-dashboard.js).
--
-- Without this policy, the UPDATE silently affects 0 rows — Supabase still
-- returns success, so the user sees "saved" while the value never changed.
--
-- The WITH CHECK clause prevents privilege escalation: users may only update
-- their own row, and may NOT change their `role` to escape the client tier.
-- Safe to re-run.
-- =============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING       (auth.uid() = id)
    WITH CHECK  (
        auth.uid() = id
        AND role = (SELECT role FROM users WHERE id = auth.uid())
    );
