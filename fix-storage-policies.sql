-- Run this in Supabase Dashboard > SQL Editor

-- First, list all existing policies on storage.objects so we can see them
-- (Check the results before running the rest)

-- Drop ALL policies on storage.objects
do $$
declare
    pol record;
begin
    for pol in
        select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
    loop
        execute format('drop policy if exists %I on storage.objects', pol.policyname);
    end loop;
end $$;

-- Recreate clean policies for verification-files bucket
create policy "allow authenticated uploads"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'verification-files');

create policy "allow public reads"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'verification-files');

create policy "allow authenticated deletes"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'verification-files');
