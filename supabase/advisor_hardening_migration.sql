BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.cv_versions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.job_matches jm
SET user_id = cv.user_id
FROM public.cv_versions cv
WHERE jm.cv_version_id = cv.id
  AND jm.user_id IS NULL
  AND cv.user_id IS NOT NULL;

UPDATE public.cover_letters cl
SET user_id = COALESCE(jm.user_id, cv.user_id)
FROM public.job_matches jm
JOIN public.cv_versions cv
  ON cv.id = cl.cv_version_id
WHERE cl.job_match_id = jm.id
  AND cl.user_id IS NULL
  AND COALESCE(jm.user_id, cv.user_id) IS NOT NULL;

UPDATE public.pipeline_runs pr
SET user_id = cv.user_id
FROM public.cv_versions cv
WHERE pr.cv_version_id = cv.id
  AND pr.user_id IS NULL
  AND cv.user_id IS NOT NULL;

UPDATE public.jobs j
SET user_id = derived.user_id
FROM (
  SELECT jm.job_id, max(jm.user_id) AS user_id
  FROM public.job_matches jm
  WHERE jm.user_id IS NOT NULL
  GROUP BY jm.job_id
) AS derived
WHERE j.id = derived.job_id
  AND j.user_id IS NULL;

ALTER TABLE public.cv_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cv_versions_select_own" ON public.cv_versions;
DROP POLICY IF EXISTS "cv_versions_insert_own" ON public.cv_versions;
DROP POLICY IF EXISTS "cv_versions_update_own" ON public.cv_versions;
DROP POLICY IF EXISTS "cv_versions_delete_own" ON public.cv_versions;

CREATE POLICY "cv_versions_select_own"
ON public.cv_versions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "cv_versions_insert_own"
ON public.cv_versions
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "cv_versions_update_own"
ON public.cv_versions
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "cv_versions_delete_own"
ON public.cv_versions
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "jobs_select_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_own" ON public.jobs;

CREATE POLICY "jobs_select_own"
ON public.jobs
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "jobs_insert_own"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "jobs_update_own"
ON public.jobs
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "jobs_delete_own"
ON public.jobs
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "job_matches_select_own" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_insert_own" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_update_own" ON public.job_matches;
DROP POLICY IF EXISTS "job_matches_delete_own" ON public.job_matches;

CREATE POLICY "job_matches_select_own"
ON public.job_matches
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "job_matches_insert_own"
ON public.job_matches
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "job_matches_update_own"
ON public.job_matches
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "job_matches_delete_own"
ON public.job_matches
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "cover_letters_select_own" ON public.cover_letters;
DROP POLICY IF EXISTS "cover_letters_insert_own" ON public.cover_letters;
DROP POLICY IF EXISTS "cover_letters_update_own" ON public.cover_letters;
DROP POLICY IF EXISTS "cover_letters_delete_own" ON public.cover_letters;

CREATE POLICY "cover_letters_select_own"
ON public.cover_letters
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "cover_letters_insert_own"
ON public.cover_letters
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "cover_letters_update_own"
ON public.cover_letters
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "cover_letters_delete_own"
ON public.cover_letters
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "pipeline_runs_select_own" ON public.pipeline_runs;
DROP POLICY IF EXISTS "pipeline_runs_insert_own" ON public.pipeline_runs;
DROP POLICY IF EXISTS "pipeline_runs_update_own" ON public.pipeline_runs;
DROP POLICY IF EXISTS "pipeline_runs_delete_own" ON public.pipeline_runs;

CREATE POLICY "pipeline_runs_select_own"
ON public.pipeline_runs
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "pipeline_runs_insert_own"
ON public.pipeline_runs
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "pipeline_runs_update_own"
ON public.pipeline_runs
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "pipeline_runs_delete_own"
ON public.pipeline_runs
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.ensure_single_active_cv_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF new.is_active AND new.user_id IS NOT NULL THEN
    UPDATE public.cv_versions
    SET is_active = false,
        updated_at = now()
    WHERE id <> new.id
      AND user_id = new.user_id
      AND is_active = true;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_cover_letter_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF new.version_no IS NULL OR new.version_no <= 0 THEN
    SELECT COALESCE(max(version_no), 0) + 1
    INTO new.version_no
    FROM public.cover_letters
    WHERE job_match_id = new.job_match_id;
  END IF;

  RETURN new;
END;
$$;

ALTER VIEW public.active_cv_profile SET (security_invoker = true);
ALTER VIEW public.job_feed SET (security_invoker = true);
ALTER VIEW public.active_job_feed SET (security_invoker = true);

DROP INDEX IF EXISTS public.idx_cover_letters_generated_at;

DROP INDEX IF EXISTS public.idx_jobs_source;
DROP INDEX IF EXISTS public.idx_jobs_posted_at;
DROP INDEX IF EXISTS public.idx_jobs_last_seen_at;
DROP INDEX IF EXISTS public.idx_jobs_listing_status;
DROP INDEX IF EXISTS public.idx_jobs_country;
DROP INDEX IF EXISTS public.idx_jobs_company;

DROP INDEX IF EXISTS public.idx_job_matches_status;
DROP INDEX IF EXISTS public.idx_job_matches_matched_at;

DROP INDEX IF EXISTS public.idx_cv_versions_parsed_at;
DROP INDEX IF EXISTS public.idx_cv_versions_is_active;
DROP INDEX IF EXISTS public.ux_cv_versions_single_active;

DROP INDEX IF EXISTS public.idx_pipeline_runs_started_at;
DROP INDEX IF EXISTS public.idx_pipeline_runs_status;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_external_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_user_external_key
  ON public.jobs (user_id, external_key)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_user_country_posted_at
  ON public.jobs (user_id, country, posted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_jobs_user_last_seen_at
  ON public.jobs (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_cv_versions_user_parsed_at
  ON public.cv_versions (user_id, parsed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cv_versions_single_active_user
  ON public.cv_versions (user_id)
  WHERE is_active = true
    AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_matches_user_cv_score
  ON public.job_matches (user_id, cv_version_id, match_score DESC);

CREATE INDEX IF NOT EXISTS idx_cover_letters_job_id
  ON public.cover_letters (job_id);

CREATE INDEX IF NOT EXISTS idx_cover_letters_cv_version_id
  ON public.cover_letters (cv_version_id);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user_id
  ON public.cover_letters (user_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_cv_version_id
  ON public.pipeline_runs (cv_version_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id
  ON public.pipeline_runs (user_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_started_at
  ON public.pipeline_runs (user_id, started_at DESC);

COMMIT;
