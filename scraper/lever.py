"""
Lever public postings adapter.
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

REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; EuropeJobHunter/1.0)",
    "Accept": "application/json",
}


def fetch_lever_jobs(source: dict, keywords: list[str], target_country_codes: list[str]) -> list[dict]:
    site = source.get("token_or_site", "").strip()
    if not site:
        return []

    url = f"https://api.lever.co/v0/postings/{site}"
    response = requests.get(url, params={"mode": "json"}, headers=REQUEST_HEADERS, timeout=12)
    response.raise_for_status()
    payload = response.json()

    jobs = []
    for raw in payload or []:
        title = (raw.get("text") or "").strip()
        location = (raw.get("categories") or {}).get("location", "").strip()
        description = clean_text(raw.get("descriptionPlain") or raw.get("description") or "")
        apply_url = (raw.get("hostedUrl") or raw.get("applyUrl") or "").strip()

        if not apply_url:
            continue
        if not matches_keywords([title, description], keywords):
            continue
        if not location_matches_country_codes(location, target_country_codes):
            continue

        jobs.append({
            "id": generate_job_id(apply_url),
            "source_job_id": str(raw.get("id", "")).strip(),
            "title": title,
            "company": source.get("company", "Unknown"),
            "location": location or infer_country_name("", source.get("country_codes", [])),
            "country": infer_country_name(location, source.get("country_codes", [])),
            "country_code": infer_country_code(location, source.get("country_codes", [])),
            "url": apply_url,
            "description": description[:1200],
            "salary": "",
            "source": "lever",
            "employment_type": ((raw.get("categories") or {}).get("commitment") or "").strip(),
            "remote_type": "remote" if "remote" in location.lower() else "",
            "match_score": 0.0,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "posted_at": lever_posted_at(raw.get("createdAt")),
            "seen": False,
        })

    return jobs


def clean_text(value: str) -> str:
    text = unescape(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def lever_posted_at(value) -> str:
    if value in (None, ""):
        return ""
    try:
        timestamp = float(value) / 1000.0
    except (TypeError, ValueError):
        return ""
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
