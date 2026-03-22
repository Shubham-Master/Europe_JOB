"""
Shared profile and location helpers for free job sources.
"""

from __future__ import annotations

import hashlib
import re

DEFAULT_TARGET_COUNTRIES = ["nl", "de", "be", "ch"]

COUNTRY_CODE_TO_LOCATION = {
    "at": "Austria",
    "be": "Belgium",
    "ch": "Switzerland",
    "cz": "Czechia",
    "de": "Germany",
    "dk": "Denmark",
    "es": "Spain",
    "fi": "Finland",
    "fr": "France",
    "gb": "United Kingdom",
    "ie": "Ireland",
    "it": "Italy",
    "lu": "Luxembourg",
    "nl": "Netherlands",
    "no": "Norway",
    "pl": "Poland",
    "pt": "Portugal",
    "se": "Sweden",
}

COUNTRY_ALIASES = {
    "gb": ["united kingdom", "uk", "great britain", "england", "scotland", "wales"],
    "cz": ["czechia", "czech republic"],
}

REMOTE_LOCATION_KEYWORDS = (
    "remote",
    "anywhere",
    "worldwide",
    "global",
    "europe",
    "emea",
    "home based",
    "home-based",
    "work from home",
)


def generate_job_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]


def normalize_country_codes(items, fallback=None) -> list[str]:
    fallback = fallback or []
    seen = set()
    normalized = []

    for item in items or []:
        if not isinstance(item, str):
            continue
        code = item.lower().strip()
        if code not in COUNTRY_CODE_TO_LOCATION or code in seen:
            continue
        seen.add(code)
        normalized.append(code)

    return normalized or list(fallback)


def resolve_country_names(country_codes: list[str]) -> list[str]:
    return [
        COUNTRY_CODE_TO_LOCATION[code]
        for code in normalize_country_codes(country_codes)
        if code in COUNTRY_CODE_TO_LOCATION
    ]


def is_remote_friendly_location(location: str) -> bool:
    text = normalize_text(location)
    return any(keyword in text for keyword in REMOTE_LOCATION_KEYWORDS)


def location_matches_country_codes(location: str, country_codes: list[str]) -> bool:
    normalized_codes = normalize_country_codes(country_codes)
    if not normalized_codes:
        return True

    text = normalize_text(location)
    if not text:
        return True

    if is_remote_friendly_location(location):
        return True

    for code in normalized_codes:
        location_name = COUNTRY_CODE_TO_LOCATION.get(code, "").lower()
        aliases = COUNTRY_ALIASES.get(code, [])
        if location_name and location_name in text:
            return True
        if any(alias in text for alias in aliases):
            return True

    return False


def infer_country_code(location: str, fallback_codes: list[str] | None = None) -> str:
    text = normalize_text(location)
    for code, name in COUNTRY_CODE_TO_LOCATION.items():
        if name.lower() in text:
            return code
        if any(alias in text for alias in COUNTRY_ALIASES.get(code, [])):
            return code

    fallback_codes = normalize_country_codes(fallback_codes)
    if len(fallback_codes) == 1:
        return fallback_codes[0]

    return ""


def infer_country_name(location: str, fallback_codes: list[str] | None = None) -> str:
    if is_remote_friendly_location(location):
        return "Remote"

    country_code = infer_country_code(location, fallback_codes)
    if country_code:
        return COUNTRY_CODE_TO_LOCATION.get(country_code, location.strip())

    return location.strip() or "Remote"


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())

