"""
RSS Feed Scraper
Scrapes jobs from Indeed and other free RSS feeds.
No API key required!
"""

import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import quote

import requests

# RSS feed templates per source
RSS_SOURCES = {
    "indeed": "https://www.indeed.com/rss?q={keyword}&l={location}&fromage=7",
    "eurojobs": "https://www.eurojobs.com/search-results-jobs/?keywords={keyword}&rss=1",
}

EUROPEAN_LOCATIONS = [
    "Germany",
    "Netherlands",
    "France",
    "Belgium",
    "Switzerland",
    "Austria",
    "Poland",
    "Sweden",
    "Denmark",
    "Ireland",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; JobHunterBot/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}


def generate_job_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]


def fetch_indeed_rss(keyword: str, location: str = "Germany") -> list[dict]:
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
        response.raise_for_status()
        return parse_rss_feed(response.text, location, source="indeed")

    except requests.exceptions.RequestException as e:
        print(f"  ❌ Indeed RSS failed for {location}: {e}")
        return []


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
                "title": title,
                "company": company,
                "location": location,
                "country": location,
                "country_code": "",
                "url": url,
                "description": description[:500],  # Trim long descriptions
                "salary": "",
                "source": source,
                "match_score": 0.0,
                "scraped_at": datetime.utcnow().isoformat(),
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


def scrape_rss_for_profile(profile: dict, locations: list[str] = None) -> list[dict]:
    """
    Scrape RSS feeds based on CV profile keywords.

    Args:
        profile: Parsed CV profile dict
        locations: European locations to search

    Returns:
        List of scraped jobs
    """
    if locations is None:
        locations = ["Germany", "Netherlands", "France", "Ireland"]

    from scraper.adzuna import build_keywords
    keywords = build_keywords(profile)

    print(f"\n🔍 RSS Keywords: {keywords}")
    print(f"🌍 Locations: {locations}\n")

    all_jobs = []
    seen_ids = set()

    for keyword in keywords[:3]:  # Limit to 3 keywords for RSS
        for location in locations[:3]:  # Limit to 3 locations
            jobs = fetch_indeed_rss(keyword, location)

            for job in jobs:
                if job["id"] not in seen_ids:
                    seen_ids.add(job["id"])
                    all_jobs.append(job)

            time.sleep(1)  # Be polite

    print(f"\n🎯 Total unique RSS jobs: {len(all_jobs)}")
    return all_jobs


if __name__ == "__main__":
    import json
    import sys
    import os

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
