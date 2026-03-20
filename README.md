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
```

Required values in `.env`:

```env
GEMINI_API_KEY=your_real_key
GEMINI_MODEL=gemini-2.5-flash-lite
PYTHON_PATH=../venv/bin/python
```

Optional values:

```env
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SUPABASE_URL=
SUPABASE_KEY=
```

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
