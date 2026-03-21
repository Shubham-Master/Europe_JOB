"""
Main Scraper — combines Adzuna + RSS feeds
Run this to scrape all sources at once.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scraper.adzuna import scrape_for_profile
from scraper.rss_feeds import scrape_rss_for_profile

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

    # ── Source 1: Adzuna API ──────────────────────────────────────
    print("\n📦 SOURCE 1: Adzuna API")
    try:
        adzuna_jobs = scrape_for_profile(profile)
        for job in adzuna_jobs:
            if job["id"] not in seen_ids:
                seen_ids.add(job["id"])
                all_jobs.append(job)
        print(f"✅ Adzuna: {len(adzuna_jobs)} jobs")
    except Exception as e:
        print(f"⚠️  Adzuna failed: {e}")

    # ── Source 2: RSS Feeds ───────────────────────────────────────
    print("\n📦 SOURCE 2: RSS Feeds (Indeed)")
    try:
        rss_jobs = scrape_rss_for_profile(profile)
        new_count = 0
        for job in rss_jobs:
            if job["id"] not in seen_ids:
                seen_ids.add(job["id"])
                all_jobs.append(job)
                new_count += 1
        print(f"✅ RSS: {new_count} new unique jobs")
    except Exception as e:
        print(f"⚠️  RSS failed: {e}")

    # ── Save ──────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_jobs, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print(f"🎉 DONE! Total unique jobs: {len(all_jobs)}")
    print(f"💾 Saved to: {output_path}")
    print(f"🕐 Scraped at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)
    print("\n➡️  Next: run matcher to score jobs against your profile")
    print("   python matcher/matcher.py")

    return all_jobs


if __name__ == "__main__":
    profile = sys.argv[1] if len(sys.argv) > 1 else str(DEFAULT_PROFILE_PATH)
    output = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_OUTPUT_PATH)
    run_all_scrapers(profile, output)
