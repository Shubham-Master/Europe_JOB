# 🌍 Europe Job Hunter

> An intelligent, fully automated job hunting system that scrapes European job boards, matches listings to your CV, tailors your resume, and writes cover letters — all for free.

![Python](https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python)
![Claude AI](https://img.shields.io/badge/Claude-AI%20Powered-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Status](https://img.shields.io/badge/Status-In%20Development-yellow?style=flat-square)

---

## 🎯 What It Does

1. **Parses your CV** → Extracts skills, experience, roles using Claude AI
2. **Scrapes job boards** → LinkedIn (via aggregators), Indeed, Glassdoor, Adzuna across all of Europe
3. **Matches & scores jobs** → Ranks each listing against your profile (0–100%)
4. **Tailors your CV** → Rewrites bullet points to match the job description (ATS-friendly)
5. **Writes cover letters** → Personalized cover letter per job, in your tone
6. **Sends daily alerts** → Telegram notification with top matches every morning
7. **Runs for free** → GitHub Actions (cron) + Supabase (DB) + free API tiers

---

## 🗺️ Architecture

```
[Your CV (PDF)]
      ↓
[CV Parser] ──────────────────────────────────────────┐
                                                       ↓
[Adzuna API]  ──┐                             [Your Skills Profile]
[JSearch API] ──┼──→ [Job Scraper] → [Dedup] → [Matching Engine]
[RSS Feeds]   ──┘                                      ↓
                                              [Scored Job Listings]
                                                       ↓
                                            ┌──────────┴──────────┐
                                            ↓                     ↓
                                       Score > 70%          Score 40–70%
                                            ↓
                                  [Claude: Tailor CV]
                                  [Claude: Cover Letter]
                                            ↓
                                  [Telegram Alert 🔔]
                                            ↓
                                  [Supabase Database]
                                            ↓
                              [GitHub Actions runs daily ⏰]
```

---

## 🗂️ Project Structure

```
Europe_JOB/
├── cv_parser/
│   ├── __init__.py
│   └── cv_parser.py          # Parse CV PDF → structured JSON profile
│
├── scraper/
│   ├── __init__.py
│   ├── adzuna.py             # Adzuna API scraper (coming soon)
│   ├── jsearch.py            # JSearch / LinkedIn data (coming soon)
│   └── rss_feeds.py          # Indeed + LinkedIn RSS (coming soon)
│
├── matcher/
│   ├── __init__.py
│   └── matcher.py            # Score jobs against CV profile (coming soon)
│
├── ai_tools/
│   ├── __init__.py
│   ├── cv_tailor.py          # Rewrite CV bullets for each job (coming soon)
│   └── cover_letter.py       # Generate personalized cover letters (coming soon)
│
├── notifier/
│   ├── __init__.py
│   └── telegram_bot.py       # Send daily Telegram digest (coming soon)
│
├── database/
│   ├── __init__.py
│   └── db.py                 # Supabase / SQLite integration (coming soon)
│
├── data/
│   └── profile.json          # Your parsed CV profile (auto-generated, git-ignored)
│
├── .github/
│   └── workflows/
│       └── daily_scrape.yml  # GitHub Actions cron job (coming soon)
│
├── .env.example              # Environment variable template
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/Shubham-Master/Europe_JOB.git
cd Europe_JOB
```

### 2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Set up environment variables
```bash
cp .env.example .env
# Open .env and add your API keys
```

### 5. Parse your CV
```bash
python cv_parser/cv_parser.py path/to/your_cv.pdf
```

Your structured profile will be saved to `data/profile.json`.

---

## 🔑 Environment Variables

| Variable | Description | Get it here |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude AI API key | [console.anthropic.com](https://console.anthropic.com) |
| `ADZUNA_APP_ID` | Adzuna API ID | [developer.adzuna.com](https://developer.adzuna.com) |
| `ADZUNA_APP_KEY` | Adzuna API Key | [developer.adzuna.com](https://developer.adzuna.com) |
| `JSEARCH_API_KEY` | JSearch (RapidAPI) key | [rapidapi.com/jsearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | [@BotFather on Telegram](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | [@userinfobot on Telegram](https://t.me/userinfobot) |
| `SUPABASE_URL` | Supabase project URL | [supabase.com](https://supabase.com) |
| `SUPABASE_KEY` | Supabase anon key | [supabase.com](https://supabase.com) |

---

## 💰 Hosting Cost Breakdown

| Service | Usage | Cost |
|---|---|---|
| GitHub Actions | Daily cron scheduler | **Free** (2000 min/month) |
| Supabase | PostgreSQL database | **Free** (500MB) |
| Adzuna API | Job listings | **Free** (1000 calls/month) |
| JSearch API | LinkedIn/Indeed data | **Free** (200 calls/month) |
| Anthropic API | CV parsing + cover letters | ~$1–2/month |
| Telegram Bot | Notifications | **Free** |
| **Total** | | **~₹100–150/month** |

---

## 📦 Module Status

| Module | Status | Description |
|---|---|---|
| CV Parser | ✅ Done | Extract structured profile from PDF |
| Job Scraper | 🔨 In Progress | Adzuna + JSearch + RSS feeds |
| Matching Engine | ⏳ Planned | Score and rank jobs |
| Database | ⏳ Planned | Store and deduplicate listings |
| CV Tailor | ⏳ Planned | Rewrite CV per job description |
| Cover Letter | ⏳ Planned | Generate personalized cover letters |
| Telegram Notifier | ⏳ Planned | Daily digest alerts |
| GitHub Actions | ⏳ Planned | Fully automated daily pipeline |

---

## 🤝 Contributing

This is a personal project — but feel free to fork and adapt it for your own job hunt!

---

## 📄 License

MIT License — use it however you want.

---

<p align="center">Built with ❤️ and too much free time</p>
