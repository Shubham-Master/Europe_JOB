"""
RSS Feed Scraper
Scrapes jobs from Indeed and other free RSS feeds.
No API key required!
"""

import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scraper.keywords import build_search_keywords
from scraper.profile_filters import (
    COUNTRY_CODE_TO_LOCATION,
    DEFAULT_TARGET_COUNTRIES,
    generate_job_id,
    normalize_country_codes,
)

# RSS feed templates per source
RSS_SOURCES = {
    "indeed": "https://www.indeed.com/rss?q={keyword}&l={location}&fromage=7",
    "eurojobs": "https://www.eurojobs.com/search-results-jobs/?keywords={keyword}&rss=1",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

DEFAULT_RSS_LOCATIONS = [
    COUNTRY_CODE_TO_LOCATION[code]
    for code in DEFAULT_TARGET_COUNTRIES
]


def fetch_indeed_rss(keyword: str, location: str = "Germany", return_meta: bool = False):
    """
    Fetch jobs from Indeed RSS feed.

    Args:
        keyword: Job search term
        location: European city or country

    Returns:
        List of job dicts
    """
    url = RSS_SOURCES["indeed"].format(
        keyword=quote(keyword),
        location=quote(location),
    )

    try:
        print(f"  📡 Indeed RSS: '{keyword}' in {location}...")
        response = requests.get(url, headers=HEADERS, timeout=10)
        if response.status_code in {403, 404}:
            print(f"  ℹ️  Indeed RSS unavailable for {location} (status {response.status_code})")
            return ([], True) if return_meta else []
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").lower()
        if "xml" not in content_type and "<rss" not in response.text[:200].lower():
            print(f"  ℹ️  Indeed RSS returned non-XML content for {location}; skipping")
            return ([], True) if return_meta else []
        jobs = parse_rss_feed(response.text, location, source="indeed_rss")
        return (jobs, False) if return_meta else jobs

    except requests.exceptions.RequestException as e:
        print(f"  ❌ Indeed RSS failed for {location}: {e}")
        return ([], False) if return_meta else []


def parse_rss_feed(xml_text: str, location: str, source: str) -> list[dict]:
    """Parse an RSS XML feed into job dicts."""
    jobs = []

    try:
        root = ET.fromstring(xml_text)
        channel = root.find("channel")
        if channel is None:
            return []

        items = channel.findall("item")
        for item in items:
            title = item.findtext("title", "").strip()
            url = item.findtext("link", "").strip()
            description = item.findtext("description", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            posted_at = ""
            if pub_date:
                try:
                    posted_at = parsedate_to_datetime(pub_date).isoformat()
                except (TypeError, ValueError, IndexError):
                    posted_at = ""

            # Clean HTML from description
            description = clean_html(description)

            # Extract company from title (Indeed format: "Job Title - Company")
            company = "Unknown"
            if " - " in title:
                parts = title.rsplit(" - ", 1)
                title = parts[0].strip()
                company = parts[1].strip()

            if not url:
                continue

            jobs.append({
                "id": generate_job_id(url),
                "source_job_id": generate_job_id(url),
                "title": title,
                "company": company,
                "location": location,
                "country": location,
                "country_code": "",
                "url": url,
                "description": description[:500],  # Trim long descriptions
                "salary": "",
                "source": source,
                "employment_type": "",
                "remote_type": "",
                "match_score": 0.0,
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "posted_at": posted_at,
                "seen": False,
            })

    except ET.ParseError as e:
        print(f"  ❌ XML parse error: {e}")

    return jobs


def clean_html(text: str) -> str:
    """Remove basic HTML tags from text."""
    import re
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def select_rss_locations(profile: dict, locations: list[str] = None) -> list[str]:
    """Resolve selected country codes into RSS search locations."""
    if locations is not None:
        return locations

    requested_countries = normalize_country_codes(
        profile.get("target_countries", []),
        DEFAULT_TARGET_COUNTRIES,
    )
    resolved = [
        COUNTRY_CODE_TO_LOCATION[country.lower().strip()]
        for country in requested_countries
        if isinstance(country, str) and country.lower().strip() in COUNTRY_CODE_TO_LOCATION
    ]

    return resolved or DEFAULT_RSS_LOCATIONS


def scrape_rss_for_profile(profile: dict, locations: list[str] = None) -> list[dict]:
    """
    Scrape RSS feeds based on CV profile keywords.

    Args:
        profile: Parsed CV profile dict
        locations: European locations to search

    Returns:
        List of scraped jobs
    """
    locations = select_rss_locations(profile, locations)

    keywords = build_search_keywords(profile, max_keywords=5)

    print(f"\n🔍 RSS Keywords: {keywords}")
    print(f"🌍 Locations: {locations}\n")

    all_jobs = []
    seen_ids = set()

    for keyword in keywords[:2]:  # Keep RSS fast enough for manual pipeline runs
        for location in locations:
            jobs, blocked = fetch_indeed_rss(keyword, location, return_meta=True)

            for job in jobs:
                if job["id"] not in seen_ids:
                    seen_ids.add(job["id"])
                    all_jobs.append(job)

            if blocked:
                print("  ℹ️  Skipping remaining Indeed RSS lookups for this run")
                print(f"\n🎯 Total unique RSS jobs: {len(all_jobs)}")
                return all_jobs

            time.sleep(1)  # Be polite

    print(f"\n🎯 Total unique RSS jobs: {len(all_jobs)}")
    return all_jobs


if __name__ == "__main__":
    import json
    import sys

    profile_path = sys.argv[1] if len(sys.argv) > 1 else "data/profile.json"

    if not os.path.exists(profile_path):
        print(f"❌ Profile not found: {profile_path}")
        sys.exit(1)

    with open(profile_path) as f:
        profile = json.load(f)

    jobs = scrape_rss_for_profile(profile)

    output_path = "data/jobs_rss.json"
    os.makedirs("data", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(jobs, f, indent=2)

    print(f"\n💾 Saved to {output_path}")
