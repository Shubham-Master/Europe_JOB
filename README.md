# Europe Job Hunter

Europe Job Hunter parses a CV, scrapes job listings, scores them against the profile, and generates tailored cover letters.

## What It Does

- Parse a PDF CV into structured JSON using Gemini
- Scrape jobs from Adzuna and free RSS sources
- Score jobs against the parsed profile
- Generate cover letters and CV bullet suggestions
- Expose the flow through a Go API and React frontend

## Main Folders

```text
Europe_JOB/
├── api/          # Go API
├── frontend/     # React UI
├── cv_parser/    # CV parsing scripts
├── scraper/      # Job scraping scripts
├── matcher/      # Job scoring logic
├── ai_tools/     # Gemini-based cover letter tools
├── notifier/     # Telegram digest sender
└── render.yaml   # Render deployment config
```

## Local Setup

```bash
git clone https://github.com/Shubham-Master/Europe_JOB.git
cd Europe_JOB
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd frontend
npm install
cd ..
```

Copy the env template:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

Required values in `.env`:

```env
GEMINI_API_KEY=your_real_key
GEMINI_MODEL=gemini-2.5-flash-lite
PYTHON_PATH=../venv/bin/python
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_backend_service_role_key
```

Required values in `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_frontend_anon_key
```

Optional values:

```env
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
VITE_API_BASE_URL=
```

Google sign-in notes:

- Enable the Google provider in Supabase Auth
- Add your local and deployed frontend URLs to the Supabase redirect allow-list
- Keep the service-role key on the backend only; never expose it in Vite env files

Supabase SQL setup:

- Run [supabase/advisor_hardening_migration.sql](/Users/ankitakant/Desktop/Shubham/GIT/Europe_JOB/supabase/advisor_hardening_migration.sql) after the base schema to add per-user ownership, RLS, and user-scoped job uniqueness
- Run [supabase/user_profiles_migration.sql](/Users/ankitakant/Desktop/Shubham/GIT/Europe_JOB/supabase/user_profiles_migration.sql) to enable the My Profile page and country targeting
- If an existing deployment still throws Supabase `42P10` on jobs upsert, run [supabase/jobs_user_unique_index_fix.sql](/Users/ankitakant/Desktop/Shubham/GIT/Europe_JOB/supabase/jobs_user_unique_index_fix.sql) once to replace the old partial unique index with a full composite unique index

## Local Run

Backend:

```bash
cd api
go run ./cmd/server
```

Frontend:

```bash
cd frontend
npm run dev
```

## Deploy

Render deployment is configured through:

- [render.yaml](/Users/ankitakant/Desktop/Shubham/GIT/Europe_JOB/render.yaml)
- [Dockerfile](/Users/ankitakant/Desktop/Shubham/GIT/Europe_JOB/Dockerfile)

Use Render Blueprint import after pushing the latest code to GitHub.

If the frontend is deployed separately on Vercel, set:

```env
VITE_API_BASE_URL=https://your-render-backend.onrender.com
```

Without this, the Vercel frontend will call its own `/api/...` routes and return `404`.
