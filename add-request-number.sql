-- Per-year sequential request numbers.
-- After running this, every row in verification_requests has request_year
-- and request_number set, and new inserts get them auto-assigned.
-- Display format: REQ-{year}-{4-digit zero-padded number}, e.g. REQ-2026-0001.
-- Safe to run multiple times.

alter table verification_requests
    add column if not exists request_year   int,
    add column if not exists request_number int;

create table if not exists request_counters (
    year     int primary key,
    last_seq int not null default 0
);

-- Backfill any rows missing a number, partitioned by year of created_at.
with numbered as (
    select
        id,
        extract(year from created_at)::int as yr,
        row_number() over (
            partition by extract(year from created_at)
            order by created_at, id
        ) as rn
    from verification_requests
    where request_number is null
)
update verification_requests v
set request_year   = n.yr,
    request_number = n.rn
from numbered n
where v.id = n.id;

-- Seed the counter table so the next assigned value picks up where backfill stopped.
insert into request_counters (year, last_seq)
select request_year, max(request_number)
from verification_requests
where request_year is not null
group by request_year
on conflict (year) do update
    set last_seq = greatest(request_counters.last_seq, excluded.last_seq);

-- Lock the counter table from anon/authenticated REST access.
-- The trigger function below is SECURITY DEFINER so it can still write.
revoke all on request_counters from anon, authenticated;

create or replace function assign_request_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    yr  int;
    seq int;
begin
    if new.request_number is not null then
        return new;
    end if;

    yr := extract(year from coalesce(new.created_at, now()))::int;

    insert into request_counters (year, last_seq)
    values (yr, 1)
    on conflict (year) do update
        set last_seq = request_counters.last_seq + 1
    returning last_seq into seq;

    new.request_year   := yr;
    new.request_number := seq;
    return new;
end;
$$;

drop trigger if exists trg_assign_request_number on verification_requests;
create trigger trg_assign_request_number
    before insert on verification_requests
    for each row
    execute function assign_request_number();
