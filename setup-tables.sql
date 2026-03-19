

-- 1. Users table (profiles)
create table if not exists users (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    display_name text not null,
    role text not null default 'user',
    created_at timestamptz default now()
);

-- 2. Verification requests table
create table if not exists verification_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users on delete cascade not null,
    student_name text not null,
    degree_diploma text not null,
    major_track text not null,
    student_status text not null,
    date_of_graduation text,
    term_started text not null,
    school_year_started text not null,
    term_ended text not null,
    school_year_ended text not null,
    school_name text not null,
    school_address text not null,
    verifier_name text not null,
    verifier_designation text not null,
    date_of_verification text not null,
    uploaded_files jsonb default '[]',
    status text not null default 'pending',
    admin_remarks text,
    -- document_assessment stores per-file assessment results from admin review.
    -- Each entry: { "file_name": "...", "assessment": "authentic|tampered|fabricated" }
    document_assessment jsonb default null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2b. Add document_assessment to existing installations (safe to re-run)
alter table verification_requests
    add column if not exists document_assessment jsonb default null;

-- 3. Enable Row Level Security
alter table users enable row level security;
alter table verification_requests enable row level security;

-- 4. Policies for "users" table
create policy if not exists "Users can read own profile"
    on users for select
    using (auth.uid() = id);

create policy if not exists "Users can insert own profile"
    on users for insert
    with check (auth.uid() = id);

-- Admin can read all users
create policy if not exists "Admin can read all users"
    on users for select
    using (
        exists (select 1 from users where id = auth.uid() and role = 'admin')
    );

-- 5. Policies for "verification_requests" table
-- Users can insert their own requests
create policy if not exists "Users can insert own requests"
    on verification_requests for insert
    with check (auth.uid() = user_id);

-- Users can read their own requests
create policy if not exists "Users can read own requests"
    on verification_requests for select
    using (auth.uid() = user_id);

-- Admin can read all requests
create policy if not exists "Admin can read all requests"
    on verification_requests for select
    using (
        exists (select 1 from users where id = auth.uid() and role = 'admin')
    );

-- Admin can update all requests (for status/remarks)
create policy if not exists "Admin can update all requests"
    on verification_requests for update
    using (
        exists (select 1 from users where id = auth.uid() and role = 'admin')
    );
