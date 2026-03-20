-- Europe Job Hunter
-- Supabase / Postgres schema
--
-- Purpose:
-- - Persist CV versions and parsed profiles
-- - Persist jobs from multiple sources with posted/expiry timestamps
-- - Persist match scores per CV version
-- - Persist cover letter history per job match
-- - Persist pipeline run history
--
-- This schema is intentionally backend-first.
-- It does not depend on Supabase Auth yet, which keeps the first production
-- setup simpler for a single-user MVP.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.cv_versions (
  id uuid primary key default gen_random_uuid(),
  filename text,
  storage_path text,
  file_checksum text,
  profile_json jsonb not null default '{}'::jsonb,
  full_name text,
  current_title text,
  summary text,
  seniority_level text default 'unknown',
  years_of_experience numeric(4, 1),
  is_active boolean not null default false,
  parsed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cv_versions_seniority_check
    check (seniority_level in ('junior', 'mid', 'senior', 'lead', 'manager', 'director', 'unknown'))
);

create index if not exists idx_cv_versions_parsed_at on public.cv_versions (parsed_at desc);
create index if not exists idx_cv_versions_is_active on public.cv_versions (is_active);
create unique index if not exists ux_cv_versions_single_active
  on public.cv_versions ((is_active))
  where is_active = true;

create or replace function public.ensure_single_active_cv_version()
returns trigger
language plpgsql
as $$
begin
  if new.is_active then
    update public.cv_versions
    set is_active = false,
        updated_at = now()
    where id <> new.id
      and is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cv_versions_set_updated_at on public.cv_versions;
create trigger trg_cv_versions_set_updated_at
before update on public.cv_versions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cv_versions_single_active on public.cv_versions;
create trigger trg_cv_versions_single_active
before insert or update on public.cv_versions
for each row
execute function public.ensure_single_active_cv_version();

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  source text not null,
  source_job_id text,
  external_url text not null,
  title text not null,
  company text,
  location text,
  country text,
  country_code text,
  remote_type text,
  employment_type text,
  listing_status text not null default 'active',
  salary_min numeric(12, 2),
  salary_max numeric(12, 2),
  salary_currency text default 'EUR',
  salary_text text,
  description text,
  posted_at timestamptz,
  expires_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  scraped_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_source_check
    check (source in ('adzuna', 'indeed_rss', 'eurojobs_rss', 'remotive', 'linkedin', 'manual')),
  constraint jobs_listing_status_check
    check (listing_status in ('active', 'expired', 'filled', 'hidden', 'unknown'))
);

create index if not exists idx_jobs_source on public.jobs (source);
create index if not exists idx_jobs_posted_at on public.jobs (posted_at desc nulls last);
create index if not exists idx_jobs_last_seen_at on public.jobs (last_seen_at desc);
create index if not exists idx_jobs_listing_status on public.jobs (listing_status);
create index if not exists idx_jobs_country on public.jobs (country);
create index if not exists idx_jobs_company on public.jobs (company);

drop trigger if exists trg_jobs_set_updated_at on public.jobs;
create trigger trg_jobs_set_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  cv_version_id uuid not null references public.cv_versions(id) on delete cascade,
  match_score numeric(5, 2) not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  match_label text,
  status text not null default 'new',
  is_seen boolean not null default false,
  is_saved boolean not null default false,
  seen_at timestamptz,
  matched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_matches_status_check
    check (status in ('new', 'seen', 'saved', 'dismissed', 'applied', 'archived')),
  constraint job_matches_score_check
    check (match_score >= 0 and match_score <= 100),
  constraint ux_job_matches_job_cv unique (job_id, cv_version_id)
);

create index if not exists idx_job_matches_cv_score on public.job_matches (cv_version_id, match_score desc);
create index if not exists idx_job_matches_status on public.job_matches (status);
create index if not exists idx_job_matches_matched_at on public.job_matches (matched_at desc);

drop trigger if exists trg_job_matches_set_updated_at on public.job_matches;
create trigger trg_job_matches_set_updated_at
before update on public.job_matches
for each row
execute function public.set_updated_at();

create table if not exists public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  job_match_id uuid not null references public.job_matches(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  cv_version_id uuid not null references public.cv_versions(id) on delete cascade,
  version_no integer,
  cover_letter text not null,
  tailored_bullets jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  keywords_to_add jsonb not null default '[]'::jsonb,
  ats_score_estimate numeric(5, 2),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cover_letters_version_check
    check (version_no is null or version_no > 0)
);

create index if not exists idx_cover_letters_job_match on public.cover_letters (job_match_id, version_no desc);
create index if not exists idx_cover_letters_generated_at on public.cover_letters (generated_at desc);

create or replace function public.assign_cover_letter_version()
returns trigger
language plpgsql
as $$
begin
  if new.version_no is null or new.version_no <= 0 then
    select coalesce(max(version_no), 0) + 1
    into new.version_no
    from public.cover_letters
    where job_match_id = new.job_match_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cover_letters_set_updated_at on public.cover_letters;
create trigger trg_cover_letters_set_updated_at
before update on public.cover_letters
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cover_letters_assign_version on public.cover_letters;
create trigger trg_cover_letters_assign_version
before insert on public.cover_letters
for each row
execute function public.assign_cover_letter_version();

create unique index if not exists ux_cover_letters_job_match_version
  on public.cover_letters (job_match_id, version_no);

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  cv_version_id uuid references public.cv_versions(id) on delete set null,
  status text not null default 'queued',
  current_step text,
  message text,
  jobs_found integer not null default 0,
  jobs_matched integer not null default 0,
  top_score numeric(5, 2) not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipeline_runs_status_check
    check (status in ('queued', 'running', 'done', 'error'))
);

create index if not exists idx_pipeline_runs_started_at on public.pipeline_runs (started_at desc);
create index if not exists idx_pipeline_runs_status on public.pipeline_runs (status);

drop trigger if exists trg_pipeline_runs_set_updated_at on public.pipeline_runs;
create trigger trg_pipeline_runs_set_updated_at
before update on public.pipeline_runs
for each row
execute function public.set_updated_at();

create or replace view public.active_cv_profile as
select *
from public.cv_versions
where is_active = true
order by parsed_at desc
limit 1;

create or replace view public.job_feed as
select
  jm.id as job_match_id,
  jm.cv_version_id,
  jm.job_id,
  j.source,
  j.source_job_id,
  j.external_url as job_url,
  j.title,
  j.company,
  j.location,
  j.country,
  j.country_code,
  j.remote_type,
  j.employment_type,
  j.listing_status,
  j.salary_min,
  j.salary_max,
  j.salary_currency,
  j.salary_text,
  j.posted_at,
  j.expires_at,
  j.first_seen_at,
  j.last_seen_at,
  j.scraped_at,
  jm.match_score,
  jm.match_label,
  jm.score_breakdown,
  jm.status as match_status,
  jm.is_seen,
  jm.is_saved,
  jm.seen_at,
  cl.id as latest_cover_letter_id,
  cl.version_no as latest_cover_letter_version,
  cl.generated_at as latest_cover_letter_at,
  case
    when j.posted_at is not null
      then floor(extract(epoch from (now() - j.posted_at)) / 3600)::int
    else null
  end as hours_since_posted,
  case
    when j.expires_at is not null
      then ceil(extract(epoch from (j.expires_at - now())) / 86400)::int
    else null
  end as validity_days_left
from public.job_matches jm
join public.jobs j
  on j.id = jm.job_id
left join lateral (
  select c.id, c.version_no, c.generated_at
  from public.cover_letters c
  where c.job_match_id = jm.id
  order by c.version_no desc
  limit 1
) cl on true;

create or replace view public.active_job_feed as
select jf.*
from public.job_feed jf
where jf.cv_version_id = (
  select id
  from public.cv_versions
  where is_active = true
  order by parsed_at desc
  limit 1
);
