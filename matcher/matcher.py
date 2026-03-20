"""
Matching Engine — Europe Job Hunter
Scores each job listing against the parsed CV profile.

Scoring breakdown:
  - Title match        : 25%
  - Skills match       : 35%
  - Keywords match     : 20%
  - Seniority match    : 10%
  - Domain match       : 10%
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE_PATH = PROJECT_ROOT / "data" / "profile.json"
DEFAULT_RAW_JOBS_PATH = PROJECT_ROOT / "data" / "jobs_raw.json"
DEFAULT_MATCHED_JOBS_PATH = PROJECT_ROOT / "data" / "jobs_matched.json"


# ─── Scoring Weights ──────────────────────────────────────────────────────────

WEIGHTS = {
    "title":     0.25,
    "skills":    0.35,
    "keywords":  0.20,
    "seniority": 0.10,
    "domain":    0.10,
}

SENIORITY_KEYWORDS = {
    "junior":    ["junior", "entry", "graduate", "intern", "trainee", "jr"],
    "mid":       ["mid", "medior", "intermediate", "experienced"],
    "senior":    ["senior", "sr", "lead", "principal", "staff"],
    "manager":   ["manager", "head", "director", "vp", "chief"],
}


# ─── Core Scoring Functions ───────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Lowercase and remove special chars for comparison."""
    return re.sub(r"[^a-z0-9\s]", " ", text.lower())


def token_overlap(a: str, b: str) -> float:
    """
    Calculate what fraction of tokens in `a` appear in `b`.
    Returns 0.0 to 1.0.
    """
    tokens_a = set(normalize(a).split())
    tokens_b = set(normalize(b).split())

    if not tokens_a:
        return 0.0

    overlap = tokens_a & tokens_b
    return len(overlap) / len(tokens_a)


def list_overlap(items: list[str], text: str) -> float:
    """
    Calculate what fraction of items from a list appear in text.
    Returns 0.0 to 1.0.
    """
    if not items:
        return 0.0

    text_normalized = normalize(text)
    matches = sum(1 for item in items if normalize(item) in text_normalized)
    return min(matches / len(items), 1.0)


def score_title(job: dict, profile: dict) -> float:
    """Score based on job title vs target roles and current title."""
    job_title = job.get("title", "") + " " + job.get("description", "")[:200]

    target_roles = profile.get("target_roles", [])
    current_title = profile.get("current_title", "")

    scores = []

    # Check each target role
    for role in target_roles:
        scores.append(token_overlap(role, job_title))

    # Check current title
    if current_title:
        scores.append(token_overlap(current_title, job_title))

    return max(scores) if scores else 0.0


def score_skills(job: dict, profile: dict) -> float:
    """Score based on technical skills and programming languages found in JD."""
    job_text = job.get("title", "") + " " + job.get("description", "")

    technical_skills = profile.get("technical_skills", [])
    programming_langs = profile.get("programming_languages", [])
    frameworks = profile.get("frameworks_and_tools", [])

    # Combine all skills, weight programming langs higher
    all_skills = programming_langs + technical_skills + frameworks

    if not all_skills:
        return 0.5  # No skills info = neutral score

    return list_overlap(all_skills, job_text)


def score_keywords(job: dict, profile: dict) -> float:
    """Score based on top CV keywords found in job description."""
    job_text = job.get("title", "") + " " + job.get("description", "")
    keywords = profile.get("top_keywords", [])

    if not keywords:
        return 0.5

    return list_overlap(keywords, job_text)


def score_seniority(job: dict, profile: dict) -> float:
    """
    Score based on seniority level match.
    Penalizes if job is way above or below candidate's level.
    """
    profile_seniority = profile.get("seniority_level", "unknown").lower()
    job_text = normalize(job.get("title", "") + " " + job.get("description", "")[:300])

    if profile_seniority == "unknown":
        return 0.5  # Can't determine — neutral

    profile_keywords = SENIORITY_KEYWORDS.get(profile_seniority, [])

    # Check if job seniority matches
    job_seniority = "unknown"
    for level, keywords in SENIORITY_KEYWORDS.items():
        if any(kw in job_text for kw in keywords):
            job_seniority = level
            break

    if job_seniority == "unknown":
        return 0.6  # Seniority not mentioned — likely okay

    if job_seniority == profile_seniority:
        return 1.0  # Perfect match

    # Adjacent levels are acceptable
    levels = ["junior", "mid", "senior", "manager"]
    try:
        p_idx = levels.index(profile_seniority)
        j_idx = levels.index(job_seniority)
        gap = abs(p_idx - j_idx)
        if gap == 1:
            return 0.6  # One level off
        else:
            return 0.2  # Too far off
    except ValueError:
        return 0.5


def score_domain(job: dict, profile: dict) -> float:
    """Score based on domain/industry match."""
    job_text = job.get("title", "") + " " + job.get("description", "")
    domains = profile.get("domains", [])
    industries = profile.get("industries", [])

    all_domains = domains + industries

    if not all_domains:
        return 0.5

    return list_overlap(all_domains, job_text)


# ─── Main Scorer ──────────────────────────────────────────────────────────────

def score_job(job: dict, profile: dict) -> dict:
    """
    Score a single job against the profile.
    Returns the job dict with match_score and score_breakdown added.
    """
    scores = {
        "title":     score_title(job, profile),
        "skills":    score_skills(job, profile),
        "keywords":  score_keywords(job, profile),
        "seniority": score_seniority(job, profile),
        "domain":    score_domain(job, profile),
    }

    # Weighted total
    total = sum(scores[k] * WEIGHTS[k] for k in scores)
    total = round(total * 100, 1)  # Convert to 0-100

    job = job.copy()
    job["match_score"] = total
    job["score_breakdown"] = {k: round(v * 100, 1) for k, v in scores.items()}

    return job


def get_match_label(score: float) -> str:
    """Human-readable label for a match score."""
    if score >= 75:
        return "🟢 Excellent"
    elif score >= 55:
        return "🟡 Good"
    elif score >= 35:
        return "🟠 Fair"
    else:
        return "🔴 Low"


# ─── Batch Matcher ────────────────────────────────────────────────────────────

def match_jobs(
    jobs: list[dict],
    profile: dict,
    min_score: float = 0.0,
) -> list[dict]:
    """
    Score all jobs and return sorted by match score.

    Args:
        jobs: List of scraped job dicts
        profile: Parsed CV profile dict
        min_score: Filter out jobs below this score (0-100)

    Returns:
        Sorted list of jobs with match_score added
    """
    print(f"\n🔍 Scoring {len(jobs)} jobs against profile...")
    print(f"👤 {profile.get('full_name', 'Unknown')} — {profile.get('current_title', 'Unknown')}")

    scored = []
    for i, job in enumerate(jobs):
        scored_job = score_job(job, profile)
        scored.append(scored_job)

        if (i + 1) % 50 == 0:
            print(f"  ⚡ Scored {i + 1}/{len(jobs)} jobs...")

    # Sort by score descending
    scored.sort(key=lambda j: j["match_score"], reverse=True)

    # Filter by min score
    if min_score > 0:
        scored = [j for j in scored if j["match_score"] >= min_score]

    # Print top 10
    print(f"\n🏆 TOP MATCHES (out of {len(scored)} jobs):\n")
    for job in scored[:10]:
        label = get_match_label(job["match_score"])
        print(f"  {label} {job['match_score']}% — {job['title']} @ {job['company']} ({job['country']})")

    return scored


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    profile_path = sys.argv[1] if len(sys.argv) > 1 else str(DEFAULT_PROFILE_PATH)
    jobs_path    = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_RAW_JOBS_PATH)
    output_path  = sys.argv[3] if len(sys.argv) > 3 else str(DEFAULT_MATCHED_JOBS_PATH)
    min_score    = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0

    for path in [profile_path, jobs_path]:
        if not os.path.exists(path):
            print(f"❌ File not found: {path}")
            sys.exit(1)

    with open(profile_path, encoding="utf-8") as f:
        profile = json.load(f)

    with open(jobs_path, encoding="utf-8") as f:
        jobs = json.load(f)

    matched = match_jobs(jobs, profile, min_score=min_score)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(matched, f, indent=2, ensure_ascii=False)

    print(f"\n💾 Saved {len(matched)} matched jobs to: {output_path}")
    print(f"\n📊 Score Distribution:")
    excellent = sum(1 for j in matched if j["match_score"] >= 75)
    good      = sum(1 for j in matched if 55 <= j["match_score"] < 75)
    fair      = sum(1 for j in matched if 35 <= j["match_score"] < 55)
    low       = sum(1 for j in matched if j["match_score"] < 35)
    print(f"   🟢 Excellent (75%+) : {excellent}")
    print(f"   🟡 Good     (55-75%): {good}")
    print(f"   🟠 Fair     (35-55%): {fair}")
    print(f"   🔴 Low      (<35%)  : {low}")
    print(f"\n➡️  Next: python ai_tools/cover_letter.py")
