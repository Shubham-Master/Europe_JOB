"""
Adzuna Job Scraper
Scrapes jobs from Adzuna API across European countries.
Free tier: 1000 calls/month
Sign up: https://developer.adzuna.com
"""

import os
import time
import hashlib
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

# European countries supported by Adzuna
EUROPEAN_COUNTRIES = {
    "gb": "United Kingdom",
    "de": "Germany",
    "fr": "France",
    "nl": "Netherlands",
    "be": "Belgium",
    "at": "Austria",
    "ch": "Switzerland",
    "pl": "Poland",
    "it": "Italy",
    "es": "Spain",
}

BASE_URL = "https://api.adzuna.com/v1/api/jobs"


def generate_job_id(url: str) -> str:
    """Generate a unique ID for a job based on its URL."""
    return hashlib.md5(url.encode()).hexdigest()[:12]


def fetch_jobs_by_keyword(
    keyword: str,
    country_code: str = "de",
    pages: int = 2,
    results_per_page: int = 20,
) -> list[dict]:
    """
    Fetch jobs from Adzuna for a keyword in a specific country.

    Args:
        keyword: Job search keyword e.g. "python developer"
        country_code: 2-letter country code e.g. "de", "gb", "fr"
        pages: Number of pages to fetch (each page = results_per_page jobs)
        results_per_page: Jobs per page (max 50)

    Returns:
        List of job dicts
    """
    app_id = os.environ.get("ADZUNA_APP_ID")
    app_key = os.environ.get("ADZUNA_APP_KEY")

    if not app_id or not app_key:
        raise ValueError("ADZUNA_APP_ID and ADZUNA_APP_KEY must be set in .env")

    all_jobs = []

    for page in range(1, pages + 1):
        url = f"{BASE_URL}/{country_code}/search/{page}"
        params = {
            "app_id": app_id,
            "app_key": app_key,
            "what": keyword,
            "results_per_page": results_per_page,
            "content-type": "application/json",
            "sort_by": "date",
        }

        try:
            print(f"  📡 Fetching page {page} for '{keyword}' in {EUROPEAN_COUNTRIES.get(country_code, country_code)}...")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            jobs = data.get("results", [])
            for job in jobs:
                all_jobs.append(parse_adzuna_job(job, country_code))

            print(f"  ✅ Got {len(jobs)} jobs (total so far: {len(all_jobs)})")

            # Be polite to the API
            time.sleep(0.5)

        except requests.exceptions.HTTPError as e:
            print(f"  ❌ HTTP error for {country_code}/{keyword}: {e}")
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request failed: {e}")

    return all_jobs


def parse_adzuna_job(raw: dict, country_code: str) -> dict:
    """Parse raw Adzuna job result into our standard format."""
    url = raw.get("redirect_url", "")
    salary_min = raw.get("salary_min")
    salary_max = raw.get("salary_max")

    salary = ""
    if salary_min and salary_max:
        salary = f"€{int(salary_min):,} - €{int(salary_max):,}"
    elif salary_min:
        salary = f"€{int(salary_min):,}+"

    return {
        "id": generate_job_id(url),
        "source_job_id": str(raw.get("id", "")).strip(),
        "title": raw.get("title", "").strip(),
        "company": raw.get("company", {}).get("display_name", "Unknown"),
        "location": raw.get("location", {}).get("display_name", ""),
        "country": EUROPEAN_COUNTRIES.get(country_code, country_code.upper()),
        "country_code": country_code,
        "url": url,
        "description": raw.get("description", "").strip(),
        "salary": salary,
        "source": "adzuna",
        "employment_type": raw.get("contract_time", "") or "",
        "remote_type": "",
        "match_score": 0.0,  # Will be set by matcher
        "scraped_at": datetime.utcnow().isoformat(),
        "posted_at": raw.get("created", "") or "",
        "seen": False,
    }


def scrape_for_profile(profile: dict, countries: list[str] = None, pages_per_search: int = 2) -> list[dict]:
    """
    Main function: scrape jobs based on a parsed CV profile.

    Args:
        profile: Parsed CV profile dict (from cv_parser)
        countries: List of country codes to search (default: top 5 European)
        pages_per_search: Pages to fetch per keyword/country combo

    Returns:
        List of all scraped jobs (deduplicated)
    """
    if countries is None:
        countries = ["de", "nl", "gb", "fr", "be"]

    # Build search keywords from profile
    keywords = build_keywords(profile)
    print(f"\n🔍 Search keywords: {keywords}")
    print(f"🌍 Countries: {[EUROPEAN_COUNTRIES[c] for c in countries]}\n")

    all_jobs = []
    seen_ids = set()

    for keyword in keywords:
        for country in countries:
            print(f"\n[{keyword}] → {EUROPEAN_COUNTRIES[country]}")
            jobs = fetch_jobs_by_keyword(keyword, country, pages=pages_per_search)

            # Deduplicate
            for job in jobs:
                if job["id"] not in seen_ids:
                    seen_ids.add(job["id"])
                    all_jobs.append(job)

    print(f"\n🎯 Total unique jobs scraped: {len(all_jobs)}")
    return all_jobs


def build_keywords(profile: dict) -> list[str]:
    """
    Build a smart list of search keywords from the CV profile.
    Returns max 5 keywords to stay within API limits.
    """
    keywords = []

    # Use target roles first (most specific)
    target_roles = profile.get("target_roles", [])
    keywords.extend(target_roles[:2])

    # Add current title
    current_title = profile.get("current_title", "")
    if current_title and current_title not in keywords:
        keywords.append(current_title)

    # Add domain-based keywords
    domains = profile.get("domains", [])
    domain_map = {
        "backend": "backend developer",
        "frontend": "frontend developer",
        "fullstack": "full stack developer",
        "data science": "data scientist",
        "devops": "devops engineer",
        "machine learning": "machine learning engineer",
        "mobile": "mobile developer",
        "cloud": "cloud engineer",
    }
    for domain in domains[:2]:
        mapped = domain_map.get(domain.lower())
        if mapped and mapped not in keywords:
            keywords.append(mapped)

    # Fallback to top technical skills
    if not keywords:
        skills = profile.get("technical_skills", [])
        if skills:
            keywords.append(skills[0] + " developer")

    return keywords[:5]  # Max 5 keywords


if __name__ == "__main__":
    import json
    import sys

    profile_path = sys.argv[1] if len(sys.argv) > 1 else "data/profile.json"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "data/jobs_raw.json"

    if not os.path.exists(profile_path):
        print(f"❌ Profile not found at {profile_path}")
        print("   Run cv_parser first: python cv_parser/cv_parser.py your_cv.pdf")
        sys.exit(1)

    with open(profile_path, "r") as f:
        profile = json.load(f)

    jobs = scrape_for_profile(profile)

    # Save results
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"\n💾 Jobs saved to: {output_path}")
