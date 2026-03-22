"""
Curated employer ATS board loader and scraper.
"""

from __future__ import annotations

import json
from pathlib import Path

from scraper.greenhouse import fetch_greenhouse_jobs
from scraper.keywords import build_search_keywords, infer_role_families
from scraper.lever import fetch_lever_jobs
from scraper.profile_filters import DEFAULT_TARGET_COUNTRIES, normalize_country_codes

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = PROJECT_ROOT / "scraper" / "company_sources.json"


def load_company_sources(manifest_path: str | Path = MANIFEST_PATH) -> list[dict]:
    path = Path(manifest_path)
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    sources = []
    for item in payload:
        sources.append({
            "company": item.get("company", "").strip(),
            "adapter": item.get("adapter", "").strip().lower(),
            "token_or_site": item.get("token_or_site", "").strip(),
            "country_codes": normalize_country_codes(item.get("country_codes", [])),
            "role_tags": [str(tag).strip().lower() for tag in item.get("role_tags", []) if str(tag).strip()],
            "careers_url": item.get("careers_url", "").strip(),
        })
    return sources


def select_company_sources(profile: dict, sources: list[dict] | None = None) -> list[dict]:
    sources = sources or load_company_sources()
    target_countries = normalize_country_codes(profile.get("target_countries", []), DEFAULT_TARGET_COUNTRIES)
    role_families = set(infer_role_families(profile))

    ranked = []
    for source in sources:
        country_overlap = len(set(source.get("country_codes", [])) & set(target_countries))
        if target_countries and source.get("country_codes") and country_overlap == 0:
            continue

        role_overlap = len(set(source.get("role_tags", [])) & role_families)
        rank = country_overlap * 10 + role_overlap
        ranked.append((rank, source.get("company", ""), source))

    ranked.sort(key=lambda item: (-item[0], item[1].lower()))
    return [item[2] for item in ranked]


def scrape_company_sources_for_profile(profile: dict, manifest_path: str | Path = MANIFEST_PATH) -> list[dict]:
    keywords = build_search_keywords(profile)
    target_countries = normalize_country_codes(profile.get("target_countries", []), DEFAULT_TARGET_COUNTRIES)
    sources = select_company_sources(profile, load_company_sources(manifest_path))

    all_jobs = []
    seen_ids = set()

    for source in sources:
        adapter = source.get("adapter")
        company = source.get("company", "Unknown")
        try:
            if adapter == "greenhouse":
                jobs = fetch_greenhouse_jobs(source, keywords, target_countries)
            elif adapter == "lever":
                jobs = fetch_lever_jobs(source, keywords, target_countries)
            else:
                print(f"  ⚠️  Skipping unsupported adapter for {company}: {adapter}")
                continue

            new_count = 0
            for job in jobs:
                if job["id"] in seen_ids:
                    continue
                seen_ids.add(job["id"])
                all_jobs.append(job)
                new_count += 1

            print(f"  ✅ {company}: {new_count} matching jobs")
        except Exception as exc:
            print(f"  ⚠️  {company} ({adapter}) failed: {exc}")

    print(f"\n🎯 Total unique ATS jobs: {len(all_jobs)}")
    return all_jobs
