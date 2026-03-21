BEGIN;

DROP INDEX IF EXISTS public.ux_jobs_user_external_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_user_external_key
  ON public.jobs (user_id, external_key);

COMMIT;
