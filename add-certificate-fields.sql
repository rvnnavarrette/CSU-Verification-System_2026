-- ================================================================
-- MIGRATION: Add certificate & CSV fields
-- Run this once in your Supabase SQL editor.
-- ================================================================

-- 1. New columns on verification_requests (admin-filled during review)
ALTER TABLE verification_requests
    ADD COLUMN IF NOT EXISTS units_earned  text,
    ADD COLUMN IF NOT EXISTS award_remarks text,
    ADD COLUMN IF NOT EXISTS mode_of_study text;

-- 2. New columns on student_records (from CSV upload)
ALTER TABLE student_records
    ADD COLUMN IF NOT EXISTS major                text,
    ADD COLUMN IF NOT EXISTS date_of_graduation   text,
    ADD COLUMN IF NOT EXISTS units_earned         text,
    ADD COLUMN IF NOT EXISTS remarks              text,
    ADD COLUMN IF NOT EXISTS term_started         text,
    ADD COLUMN IF NOT EXISTS school_year_started  text,
    ADD COLUMN IF NOT EXISTS term_ended           text,
    ADD COLUMN IF NOT EXISTS school_year_ended    text,
    ADD COLUMN IF NOT EXISTS date_of_verification text;
