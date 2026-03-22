"""
Remotive public remote jobs adapter.
"""

from __future__ import annotations

from datetime import datetime, timezone
from html import unescape
import re

import requests

from scraper.keywords import matches_keywords
from scraper.profile_filters import (
    generate_job_id,
    infer_country_code,
    infer_country_name,
    location_matches_country_codes,
)

REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs"
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; EuropeJobHunter/1.0)",
    "Accept": "application/json",
}


def fetch_remotive_jobs(profile: dict, keywords: list[str], target_country_codes: list[str]) -> list[dict]:
    response = requests.get(REMOTIVE_API_URL, headers=REQUEST_HEADERS, timeout=15)
    response.raise_for_status()
    payload = response.json()

    jobs = []
    for raw in payload.get("jobs", []) or []:
        title = (raw.get("title") or "").strip()
        location = (raw.get("candidate_required_location") or "Remote").strip()
        description = clean_text(raw.get("description") or "")
        apply_url = (raw.get("url") or "").strip()

        if not apply_url:
            continue
        if not matches_keywords([title, description, raw.get("category", "")], keywords):
            continue
        if not location_matches_country_codes(location, target_country_codes):
            continue

        jobs.append({
            "id": generate_job_id(apply_url),
            "source_job_id": str(raw.get("id", "")).strip(),
            "title": title,
            "company": (raw.get("company_name") or "Unknown").strip(),
            "location": location,
            "country": infer_country_name(location),
            "country_code": infer_country_code(location),
            "url": apply_url,
            "description": description[:1200],
            "salary": "",
            "source": "remotive",
            "employment_type": (raw.get("job_type") or "").strip(),
            "remote_type": "remote",
            "match_score": 0.0,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "posted_at": (raw.get("publication_date") or "").strip(),
            "seen": False,
        })

    return jobs


def clean_text(value: str) -> str:
    text = unescape(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()
