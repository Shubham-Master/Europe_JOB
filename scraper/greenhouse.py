"""
Greenhouse public job board adapter.
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


def fetch_greenhouse_jobs(source: dict, keywords: list[str], target_country_codes: list[str]) -> list[dict]:
    token = source.get("token_or_site", "").strip()
    if not token:
        return []

    url = f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs"
    response = requests.get(url, params={"content": "true"}, headers=REQUEST_HEADERS, timeout=12)
    response.raise_for_status()
    payload = response.json()

    jobs = []
    for raw in payload.get("jobs", []) or []:
        title = (raw.get("title") or "").strip()
        location = (raw.get("location") or {}).get("name", "").strip()
        description = clean_greenhouse_content(raw.get("content", ""))
        apply_url = (raw.get("absolute_url") or "").strip()

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
            "source": "greenhouse",
            "employment_type": extract_metadata_label(raw.get("metadata", []), "Employment Type"),
            "remote_type": "remote" if "remote" in location.lower() else "",
            "match_score": 0.0,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "posted_at": (raw.get("updated_at") or "").strip(),
            "seen": False,
        })

    return jobs


def clean_greenhouse_content(content: str) -> str:
    text = unescape(content or "")
    text = text.replace("<br>", " ").replace("<br/>", " ").replace("<br />", " ")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_metadata_label(items: list[dict], label: str) -> str:
    for item in items or []:
        if (item.get("name") or "").strip().lower() == label.lower():
            value = item.get("value")
            if isinstance(value, str):
                return value.strip()
    return ""
