"""
Shared keyword builder and text matching for broad white-collar sourcing.
"""

from __future__ import annotations

import re

SENIORITY_PATTERN = re.compile(
    r"\b(senior|sr|junior|jr|lead|principal|staff|head|director|manager|vp|intern)\b",
    re.IGNORECASE,
)
TRAILING_MODIFIER_PATTERN = re.compile(
    r"\b(remote|hybrid|onsite|on-site|contract|freelance|temporary|part time|part-time|full time|full-time)\b",
    re.IGNORECASE,
)

ROLE_FAMILY_RULES = [
    (
        "engineering",
        ("engineer", "developer", "software", "platform", "backend", "frontend", "full stack", "devops", "sre", "qa"),
        ("software engineer", "platform engineer"),
    ),
    (
        "data",
        ("data", "analytics", "business intelligence", "bi", "machine learning", "ml", "ai"),
        ("data analyst", "business analyst"),
    ),
    (
        "product",
        ("product", "program manager", "project manager", "product owner"),
        ("product manager", "program manager"),
    ),
    (
        "operations",
        ("operations", "operational", "business operations", "strategy & operations", "supply chain", "procurement"),
        ("operations manager", "business operations"),
    ),
    (
        "finance",
        ("finance", "financial", "fp&a", "accounting", "accountant", "controller", "treasury", "investment", "banking", "audit"),
        ("financial analyst", "finance manager"),
    ),
    (
        "marketing",
        ("marketing", "growth", "brand", "content", "seo", "crm", "performance marketing"),
        ("marketing manager", "growth marketing"),
    ),
    (
        "sales",
        ("sales", "account executive", "business development", "revenue", "partnerships", "commercial"),
        ("account executive", "business development"),
    ),
    (
        "customer_success",
        ("customer success", "customer support", "customer service", "account manager", "client success"),
        ("customer success manager", "account manager"),
    ),
    (
        "hr",
        ("human resources", "hr", "people operations", "talent", "recruiter", "people partner"),
        ("people operations", "talent acquisition"),
    ),
    (
        "consulting",
        ("consultant", "consulting", "advisory", "strategy consultant"),
        ("consultant", "strategy consultant"),
    ),
    (
        "compliance",
        ("compliance", "risk", "aml", "kyc", "governance", "privacy", "legal counsel", "regulatory"),
        ("compliance analyst", "risk manager"),
    ),
]

TOKEN_STOPWORDS = {
    "and", "for", "the", "with", "from", "into", "your", "role", "manager",
}


def clean_title(title: str) -> str:
    cleaned = re.sub(r"\([^)]*\)", " ", title or "")
    cleaned = re.sub(r"\[[^\]]*\]", " ", cleaned)
    cleaned = SENIORITY_PATTERN.sub(" ", cleaned)
    cleaned = TRAILING_MODIFIER_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -/,")
    return cleaned


def infer_role_families(profile: dict) -> list[str]:
    haystack = " ".join(
        str(value)
        for key in ("current_title",)
        for value in [profile.get(key, "")]
    )
    haystack += " " + " ".join(profile.get("target_roles", []) or [])
    haystack += " " + " ".join(profile.get("domains", []) or [])
    haystack += " " + " ".join(profile.get("top_keywords", []) or [])
    haystack = haystack.lower()

    families = []
    for family, triggers, _ in ROLE_FAMILY_RULES:
        if any(trigger in haystack for trigger in triggers):
            families.append(family)
    return families


def build_search_keywords(profile: dict, max_keywords: int = 6) -> list[str]:
    keywords = []

    def add_keyword(value: str):
        value = re.sub(r"\s+", " ", (value or "").strip())
        if not value:
            return
        lower_existing = {item.lower() for item in keywords}
        if value.lower() in lower_existing:
            return
        keywords.append(value)

    add_keyword(profile.get("current_title", ""))

    for role in (profile.get("target_roles", []) or [])[:2]:
        add_keyword(role)

    cleaned_title = clean_title(profile.get("current_title", ""))
    if cleaned_title and cleaned_title.lower() != (profile.get("current_title", "") or "").strip().lower():
        add_keyword(cleaned_title)

    selected_families = infer_role_families(profile)[:2]
    family_synonyms = [
        next((items for name, _, items in ROLE_FAMILY_RULES if name == family), ())
        for family in selected_families
    ]

    # Add one synonym per family first so mixed-role profiles do not get crowded out.
    for index in range(2):
        for synonyms in family_synonyms:
            if index < len(synonyms):
                add_keyword(synonyms[index])
                if len(keywords) >= max_keywords:
                    return keywords[:max_keywords]

    if not keywords:
        for keyword in (profile.get("top_keywords", []) or [])[:2]:
            add_keyword(keyword)

    return keywords[:max_keywords]


def matches_keywords(text_parts: list[str], keywords: list[str]) -> bool:
    if not keywords:
        return True

    haystack = " ".join(part for part in text_parts if part).lower()
    if not haystack:
        return False

    for keyword in keywords:
        lowered = keyword.lower()
        if lowered in haystack:
            return True

        tokens = [
            token for token in re.split(r"[^a-z0-9]+", lowered)
            if len(token) > 2 and token not in TOKEN_STOPWORDS
        ]
        if tokens and sum(token in haystack for token in tokens) >= min(2, len(tokens)):
            return True

    return False
