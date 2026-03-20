# Supabase Setup

Run [schema.sql](/Users/ankitakant/Desktop/Shubham/GIT/Europe_JOB/supabase/schema.sql) in the Supabase SQL Editor.

What this schema stores:

- CV version history with one active profile
- Raw jobs from multiple sources
- Match scores per CV version
- Cover letter history per matched job
- Pipeline run history

Main tables:

- `cv_versions`
- `jobs`
- `job_matches`
- `cover_letters`
- `pipeline_runs`

Useful views:

- `active_cv_profile`
- `job_feed`
- `active_job_feed`
