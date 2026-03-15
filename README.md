# 🌍 Europe Job Hunter

An automated service that scrapes European job boards, matches listings against your CV, and delivers curated results.

## 🗂️ Project Structure

```
Europe_JOB/
├── cv_parser/
│   └── cv_parser.py       # Parse your CV into a structured profile
├── data/
│   └── profile.json       # Your parsed profile (auto-generated, git-ignored)
├── .env.example           # Environment variable template
├── .gitignore
├── requirements.txt
└── README.md
```

## 🚀 Quick Start

### 1. Clone & setup
```bash
git clone https://github.com/Shubham-Master/Europe_JOB.git
cd Europe_JOB
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Set your API key
```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
# Get one at: https://console.anthropic.com/
```

### 3. Parse your CV
```bash
python cv_parser/cv_parser.py path/to/your_cv.pdf
```

This creates `data/profile.json` with your structured skills profile.

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude |

## 📦 Modules (in progress)

- [x] **CV Parser** — Extract structured profile from PDF
- [ ] **Job Scraper** — Scrape LinkedIn, Indeed, Glassdoor, Adzuna
- [ ] **Matching Engine** — Score jobs against your profile
- [ ] **Storage** — SQLite database for deduplication
- [ ] **Notifications** — Telegram / email digest
