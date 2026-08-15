-- Question Worker — generation_jobs schema
--
-- NOT applied automatically. Run this against the Supabase project (SQL
-- editor, or `supabase db execute -f migrations/001_generation_jobs.sql`)
-- BEFORE deploying question-worker — validate's idempotency check hits
-- generation_jobs on every job's first step.
--
-- job_id is `text`, not `uuid`: the existing ai-generated-question-status.id
-- PK type isn't visible from application code (Supabase-managed, no
-- migration files in this repo) — text is compatible with either a uuid or
-- some other generated id, and avoids a cast failure blocking every insert.

create table if not exists generation_jobs (
  job_id text primary key,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'completed', 'completed_partial', 'failed')),
  stage text,
  progress_meta jsonb not null default '{}'::jsonb,
  error_reason text,
  attempt_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function generation_jobs_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generation_jobs_updated_at on generation_jobs;
create trigger trg_generation_jobs_updated_at
  before update on generation_jobs
  for each row
  execute function generation_jobs_set_updated_at();

create table if not exists generation_job_rejected_questions (
  id bigserial primary key,
  job_id text not null references generation_jobs(job_id) on delete cascade,
  round int not null,
  question_text text not null,
  reason text not null,
  source text not null check (source in ('judge', 'dedupe')),
  created_at timestamptz not null default now()
);

create index if not exists idx_rejected_job_id on generation_job_rejected_questions(job_id);
