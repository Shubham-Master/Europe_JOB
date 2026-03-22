BEGIN;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_source_check
  CHECK (
    source IN (
      'adzuna',
      'indeed_rss',
      'eurojobs_rss',
      'remotive',
      'greenhouse',
      'lever',
      'linkedin',
      'manual'
    )
  );

COMMIT;
