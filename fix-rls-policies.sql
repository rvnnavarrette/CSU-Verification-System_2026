-- Run this in Supabase Dashboard > SQL Editor
-- Creates tables + correct RLS policies (all-in-one)

-- 1. Create users table
create table if not exists users (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    display_name text not null,
    role text not null default 'user',
    created_at timestamptz default now()
);

-- 2. Create verification_requests table
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
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 3. Enable RLS
alter table users enable row level security;
alter table verification_requests enable row level security;

-- 4. Drop any existing policies (in case they exist)
drop policy if exists "Users can read own profile" on users;
drop policy if exists "Users can insert own profile" on users;
drop policy if exists "Admin can read all users" on users;
drop policy if exists "Authenticated can read users" on users;
drop policy if exists "Users can read own requests" on verification_requests;
drop policy if exists "Users can insert own requests" on verification_requests;
drop policy if exists "Admin can read all requests" on verification_requests;
drop policy if exists "Admin can update all requests" on verification_requests;

-- 5. Users table policies
create policy "Authenticated can read users"
    on users for select
    to authenticated
    using (true);

create policy "Users can insert own profile"
    on users for insert
    to authenticated
    with check (auth.uid() = id);

-- 6. Verification requests policies
create policy "Users can insert own requests"
    on verification_requests for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can read own requests"
    on verification_requests for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Admin can read all requests"
    on verification_requests for select
    to authenticated
    using (
        exists (select 1 from users where id = auth.uid() and role = 'admin')
    );

create policy "Admin can update all requests"
    on verification_requests for update
    to authenticated
    using (
        exists (select 1 from users where id = auth.uid() and role = 'admin')
    );
