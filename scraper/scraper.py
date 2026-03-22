"""
Main Scraper — combines Adzuna + RSS feeds
Run this to scrape all sources at once.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scraper.company_sources import scrape_company_sources_for_profile
from scraper.adzuna import scrape_for_profile
from scraper.remotive import fetch_remotive_jobs
from scraper.rss_feeds import scrape_rss_for_profile
from scraper.keywords import build_search_keywords
from scraper.profile_filters import DEFAULT_TARGET_COUNTRIES, normalize_country_codes

DEFAULT_PROFILE_PATH = PROJECT_ROOT / "data" / "profile.json"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "jobs_raw.json"


def run_all_scrapers(profile_path: str = str(DEFAULT_PROFILE_PATH), output_path: str = str(DEFAULT_OUTPUT_PATH)):
    """
    Run all scrapers and combine results.

    Args:
        profile_path: Path to parsed CV profile JSON
        output_path: Where to save combined jobs
    """
    if not os.path.exists(profile_path):
        print(f"❌ Profile not found: {profile_path}")
        print("   Run first: python cv_parser/cv_parser.py your_cv.pdf")
        sys.exit(1)

    with open(profile_path, encoding="utf-8") as f:
        profile = json.load(f)

    print("=" * 60)
    print("🌍 EUROPE JOB HUNTER — SCRAPER")
    print(f"👤 Profile: {profile.get('full_name', 'Unknown')}")
    print(f"🎯 Target: {', '.join(profile.get('target_roles', [])[:3])}")
    if profile.get("target_countries"):
        print(f"🧭 Countries: {', '.join(profile.get('target_countries', []))}")
    print("=" * 60)

    all_jobs = []
    seen_ids = set()
    source_counts = {}

    def append_jobs(source_name: str, jobs: list[dict]):
        new_count = 0
        for job in jobs:
            if job["id"] in seen_ids:
                continue
            seen_ids.add(job["id"])
            all_jobs.append(job)
            new_count += 1
        source_counts[source_name] = source_counts.get(source_name, 0) + new_count
        return new_count

    keywords = build_search_keywords(profile, max_keywords=6)
    target_countries = normalize_country_codes(profile.get("target_countries", []), DEFAULT_TARGET_COUNTRIES)

    # ── Source 1: Curated ATS boards ──────────────────────────────
    print("\n📦 SOURCE 1: Curated ATS Boards")
    try:
        ats_jobs = scrape_company_sources_for_profile(profile)
        print(f"✅ ATS boards: {append_jobs('ats', ats_jobs)} new unique jobs")
    except Exception as e:
        print(f"⚠️  Curated ATS boards failed: {e}")

    # ── Source 2: Remotive ────────────────────────────────────────
    print("\n📦 SOURCE 2: Remotive")
    try:
        remotive_jobs = fetch_remotive_jobs(profile, keywords, target_countries)
        print(f"✅ Remotive: {append_jobs('remotive', remotive_jobs)} new unique jobs")
    except Exception as e:
        print(f"⚠️  Remotive failed: {e}")

    # ── Source 3: RSS Feeds ───────────────────────────────────────
    print("\n📦 SOURCE 3: RSS Feeds (Indeed)")
    try:
        rss_jobs = scrape_rss_for_profile(profile)
        print(f"✅ RSS: {append_jobs('rss', rss_jobs)} new unique jobs")
    except Exception as e:
        print(f"⚠️  RSS failed: {e}")

    # ── Source 4: Adzuna API ──────────────────────────────────────
    print("\n📦 SOURCE 4: Adzuna API")
    try:
        adzuna_jobs = scrape_for_profile(profile)
        print(f"✅ Adzuna: {append_jobs('adzuna', adzuna_jobs)} new unique jobs")
    except Exception as e:
        print(f"⚠️  Adzuna failed: {e}")

    # ── Save ──────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_jobs, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print(f"🎉 DONE! Total unique jobs: {len(all_jobs)}")
    print(f"💾 Saved to: {output_path}")
    print(f"🕐 Scraped at: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    if source_counts:
        print("📊 Source mix: " + ", ".join(f"{name}={count}" for name, count in source_counts.items()))
    print("=" * 60)
    print("\n➡️  Next: run matcher to score jobs against your profile")
    print("   python matcher/matcher.py")

    return all_jobs


if __name__ == "__main__":
    profile = sys.argv[1] if len(sys.argv) > 1 else str(DEFAULT_PROFILE_PATH)
    output = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_OUTPUT_PATH)
    run_all_scrapers(profile, output)
