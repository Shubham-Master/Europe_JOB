"""
Cover Letter Generator — Europe Job Hunter
Generates personalized cover letters and tailored CV bullets.

Modes:
- draft: deterministic, fast, no Gemini call
- ai: uses Gemini with optional tone/length/focus settings
"""

import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai_tools.gemini_client import generate_json, generate_text


DEFAULT_JOBS_PATH = PROJECT_ROOT / "data" / "jobs_matched.json"
DEFAULT_PROFILE_PATH = PROJECT_ROOT / "data" / "profile.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "applications"

DEFAULT_PREFERENCES = {
    "tone": "adaptive",
    "length": "medium",
    "focus": "skills match",
    "notes": "",
}

LENGTH_GUIDANCE = {
    "short": "140-180 words",
    "medium": "200-260 words",
    "detailed": "280-360 words",
}

FOCUS_GUIDANCE = {
    "skills match": "Emphasize the strongest overlap between the candidate profile and the job requirements.",
    "achievements": "Lead with measurable achievements and business impact that fit the role.",
    "motivation": "Explain why the role and company are a strong fit without sounding generic.",
    "leadership": "Highlight ownership, collaboration, mentoring, and stakeholder alignment.",
}

STOPWORDS = {
    "about", "after", "also", "analysis", "analyst", "and", "are", "build", "building", "candidate",
    "company", "cross", "deliver", "delivery", "engineer", "engineering", "experience", "for", "from",
    "have", "help", "high", "ideal", "into", "job", "jobs", "join", "location", "looking", "manage",
    "management", "more", "must", "needs", "our", "partner", "platform", "product", "projects",
    "provide", "relevant", "requirements", "role", "scale", "senior", "skills", "strong", "success",
    "support", "team", "their", "this", "through", "using", "with", "work", "working", "you", "your",
}


def call_gemini(prompt: str, max_tokens: int = 1500, temperature: float = 0.35) -> str:
    """Call Gemini API and return text response."""
    return generate_text(prompt, max_tokens=max_tokens, temperature=temperature)


def normalize_preferences(preferences: dict | None) -> dict:
    payload = dict(DEFAULT_PREFERENCES)
    if isinstance(preferences, dict):
        for key in payload:
            value = preferences.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                payload[key] = text
    return payload


def collect_profile_terms(profile: dict) -> list[str]:
    raw_terms = []
    for key in ("technical_skills", "programming_languages", "frameworks_and_tools", "domains", "target_roles"):
        value = profile.get(key, [])
        if isinstance(value, list):
            raw_terms.extend(str(item).strip() for item in value if str(item).strip())
    current_title = str(profile.get("current_title", "")).strip()
    if current_title:
        raw_terms.append(current_title)

    deduped = []
    seen = set()
    for item in raw_terms:
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(item)
    return deduped


def find_matching_profile_terms(job: dict, profile: dict) -> list[str]:
    job_text = " ".join([
        str(job.get("title", "")),
        str(job.get("description", "")),
        str(job.get("company", "")),
    ]).lower()
    matches = []
    for term in collect_profile_terms(profile):
        lowered = term.lower()
        if lowered and lowered in job_text:
            matches.append(term)
    return matches[:6]


def extract_priority_terms(job: dict) -> list[str]:
    text = " ".join([
        str(job.get("title", "")),
        str(job.get("description", "")),
    ])
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+#./-]{2,}", text)
    counts = Counter()
    for token in tokens:
        lowered = token.lower()
        if lowered in STOPWORDS:
            continue
        counts[lowered] += 1
    return [token for token, _ in counts.most_common(12)]


def build_tailoring_draft(job: dict, profile: dict) -> dict:
    matched_terms = find_matching_profile_terms(job, profile)
    profile_blob = " ".join(collect_profile_terms(profile)).lower()
    priority_terms = extract_priority_terms(job)
    missing_skills = [term for term in priority_terms if term not in profile_blob][:4]

    current_title = profile.get("current_title") or "recent work"
    target_role = job.get("title") or "this role"
    years = profile.get("years_of_experience") or ""
    years_prefix = f"{years}+ years" if years else "recent"

    bullets = []
    if matched_terms:
        bullets.append(
            f"Rework one bullet to show how you used {', '.join(matched_terms[:2])} in {years_prefix} {current_title} work with measurable outcomes."
        )
        bullets.append(
            f"Highlight a project that maps directly to {target_role}, especially where you improved delivery speed, reliability, or stakeholder confidence."
        )
        if len(matched_terms) > 2:
            bullets.append(
                f"Add a bullet that connects {', '.join(matched_terms[2:4])} to the priorities in this job description."
            )
    else:
        bullets.append(f"Lead with the most relevant example from your {current_title} experience for {target_role}.")
        bullets.append("Make every bullet outcome-focused and tie it to delivery, ownership, and collaboration.")

    keywords_to_add = matched_terms[:5] or priority_terms[:5]

    return {
        "tailored_bullets": bullets[:5],
        "missing_skills": missing_skills,
        "keywords_to_add": keywords_to_add,
        "ats_score_estimate": 0,
    }


def generate_cover_letter_draft(job: dict, profile: dict, tailoring: dict | None = None) -> str:
    tailoring = tailoring or build_tailoring_draft(job, profile)
    matched_terms = tailoring.get("keywords_to_add", [])

    name = profile.get("full_name", "Candidate")
    current_title = profile.get("current_title", "my current role")
    years = profile.get("years_of_experience")
    company = job.get("company", "your team")
    title = job.get("title", "this role")
    location = job.get("location") or job.get("country") or "Europe"
    target_roles = [str(item).strip() for item in profile.get("target_roles", []) if str(item).strip()]
    role_phrase = target_roles[0] if target_roles else current_title
    skill_phrase = ", ".join(matched_terms[:4]) if matched_terms else "relevant technical and delivery strengths"

    years_sentence = f" Over the last {years} years," if years else ""

    paragraphs = [
        f"Dear Hiring Team,\n\nI am excited to be considered for the {title} role at {company}.{years_sentence} I have built my work around {role_phrase}, and this opportunity stands out because it lines up closely with the kind of problems I have been solving and the direction I want to keep growing in.",
        f"What makes this role a strong fit is the overlap between your needs and my background in {skill_phrase}. Based on the job description, I would focus this application on examples where I improved delivery quality, handled cross-functional ownership, and turned complex requirements into reliable outcomes that teams could trust.",
        f"I would use this draft to keep the letter concise, specific, and honest, with clear evidence from my actual work instead of generic claims. I am open to opportunities aligned with {location}, and I would welcome the chance to discuss how my experience could support {company}'s goals.\n\nBest regards,\n{name}",
    ]

    return "\n\n".join(paragraphs)


def generate_cover_letter(job: dict, profile: dict, preferences: dict | None = None) -> str:
    """Generate a personalized cover letter for a specific job."""
    preferences = normalize_preferences(preferences)
    length_target = LENGTH_GUIDANCE.get(preferences["length"].lower(), LENGTH_GUIDANCE["medium"])
    focus_instruction = FOCUS_GUIDANCE.get(preferences["focus"].lower(), FOCUS_GUIDANCE["skills match"])
    notes = preferences.get("notes", "")
    notes_instruction = f"\nADDITIONAL USER NOTES:\n- {notes}" if notes else ""

    prompt = f"""You are an expert cover letter writer. Write a compelling cover letter for this job.

CANDIDATE PROFILE:
- Name: {profile.get('full_name', 'Candidate')}
- Current Title: {profile.get('current_title', '')}
- Years of Experience: {profile.get('years_of_experience', '')}
- Top Skills: {', '.join(profile.get('technical_skills', [])[:8])}
- Programming Languages: {', '.join(profile.get('programming_languages', [])[:6])}
- Frameworks: {', '.join(profile.get('frameworks_and_tools', [])[:6])}
- Summary: {profile.get('summary', '')}
- Open to Relocation: {profile.get('open_to_relocation', True)}

JOB DETAILS:
- Title: {job.get('title', '')}
- Company: {job.get('company', '')}
- Location: {job.get('location', '')}
- Description: {job.get('description', '')[:1000]}
 
USER PREFERENCES:
- Tone: {preferences.get('tone', 'adaptive')}
- Length target: {length_target}
- Focus: {focus_instruction}{notes_instruction}

STRICT INSTRUCTIONS:
1. LENGTH: Stay within {length_target}.
2. TONE: Follow the requested tone, but keep it professional and believable.
3. STRUCTURE (3 short paragraphs):
   Para 1 — Why THIS company specifically (show research, mention something specific)
   Para 2 — Top 2-3 skills that directly match the JD (be specific, use numbers if possible)
   Para 3 — Mention open to relocation to {job.get('location', 'Europe')} + strong call to action
4. Do NOT use "I am writing to express my interest" or any generic openers
5. Use the candidate's actual name — no placeholders
6. End with: "Best regards," followed by the candidate name
7. Write ONLY the letter body. No subject line, no date, no commentary.

Write the cover letter now:"""

    return call_gemini(prompt, max_tokens=600, temperature=0.5)


def tailor_cv_bullets(job: dict, profile: dict, use_ai: bool = True) -> dict:
    """Rewrite CV bullets to match the job description (ATS-friendly)."""
    if not use_ai:
        return build_tailoring_draft(job, profile)

    work_experience = profile.get("work_experience", [])
    exp_text = ""
    for exp in work_experience[:3]:
        exp_text += f"\n- {exp.get('title')} at {exp.get('company')}: {exp.get('description', '')}"

    prompt = f"""You are an ATS optimization expert. Rewrite the candidate's experience bullets to match this job.

JOB TITLE: {job.get('title')}
COMPANY: {job.get('company')}
JOB DESCRIPTION: {job.get('description', '')[:800]}

CANDIDATE EXPERIENCE:
{exp_text}

CANDIDATE SKILLS: {', '.join(profile.get('technical_skills', [])[:10])}

Return ONLY valid JSON (no markdown) with this structure:
{{
  "tailored_bullets": [
    "• Action verb + achievement + metric (rewritten to match JD keywords)",
    "• Another bullet...",
    "• Up to 5 bullets total"
  ],
  "missing_skills": ["skill1", "skill2"],
  "keywords_to_add": ["keyword1", "keyword2"],
  "ats_score_estimate": 75
}}"""

    try:
        raw = generate_json(prompt, max_tokens=800, temperature=0.2)
        return normalize_tailoring_result(raw)
    except (json.JSONDecodeError, ValueError):
        return {"tailored_bullets": [], "missing_skills": [], "keywords_to_add": [], "ats_score_estimate": 0}


def normalize_tailoring_result(data: dict) -> dict:
    """Keep the response shape stable for the UI and API."""
    return {
        "tailored_bullets": [str(item).strip() for item in data.get("tailored_bullets", []) if str(item).strip()][:5],
        "missing_skills": [str(item).strip() for item in data.get("missing_skills", []) if str(item).strip()],
        "keywords_to_add": [str(item).strip() for item in data.get("keywords_to_add", []) if str(item).strip()],
        "ats_score_estimate": int(data.get("ats_score_estimate", 0) or 0),
    }


def generate_application(job: dict, profile: dict, output_dir: str | None = str(DEFAULT_OUTPUT_DIR)) -> dict:
    """Generate full application package: cover letter + tailored CV bullets."""
    return generate_application_with_mode(job, profile, output_dir=output_dir, mode="ai", preferences=None)


def generate_application_with_mode(
    job: dict,
    profile: dict,
    output_dir: str | None = str(DEFAULT_OUTPUT_DIR),
    mode: str = "ai",
    preferences: dict | None = None,
) -> dict:
    """Generate a draft or AI application package."""
    normalized_mode = (mode or "ai").strip().lower()
    if normalized_mode not in {"ai", "draft"}:
        raise ValueError("mode must be 'ai' or 'draft'")

    preferences = normalize_preferences(preferences)

    company = job.get("company", "unknown").replace(" ", "_").lower()
    title   = job.get("title", "job").replace(" ", "_").lower()[:30]
    ts      = datetime.now().strftime("%Y%m%d_%H%M")
    slug    = f"{company}_{title}_{ts}"

    print(f"\n✍️  Generating: {job.get('title')} @ {job.get('company')}  [{job.get('match_score', 0)}%]")

    if normalized_mode == "draft":
        print("   📝 Building instant draft...")
        cv_data = tailor_cv_bullets(job, profile, use_ai=False)
        cover_letter = generate_cover_letter_draft(job, profile, cv_data)
    else:
        print("   📝 Writing cover letter with Gemini...")
        cover_letter = generate_cover_letter(job, profile, preferences)
        print("   🎯 Tailoring CV bullets...")
        cv_data = tailor_cv_bullets(job, profile, use_ai=True)

    package = {
        "job": {
            "id":          job.get("id"),
            "title":       job.get("title"),
            "company":     job.get("company"),
            "location":    job.get("location"),
            "url":         job.get("url"),
            "match_score": job.get("match_score"),
        },
        "cover_letter":       cover_letter,
        "tailored_bullets":   cv_data.get("tailored_bullets", []),
        "missing_skills":     cv_data.get("missing_skills", []),
        "keywords_to_add":    cv_data.get("keywords_to_add", []),
        "ats_score_estimate": cv_data.get("ats_score_estimate", 0),
        "generation_mode":    normalized_mode,
        "generation_preferences": preferences,
        "generated_at":       datetime.now(timezone.utc).isoformat(),
    }

    if output_dir is None:
        return package

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Save JSON
    with open(output_path / f"{slug}.json", "w", encoding="utf-8") as f:
        json.dump(package, f, indent=2, ensure_ascii=False)

    # Save cover letter as plain text
    with open(output_path / f"{slug}_cover_letter.txt", "w", encoding="utf-8") as f:
        f.write(f"Position : {job.get('title')} at {job.get('company')}\n")
        f.write(f"Location : {job.get('location')}\n")
        f.write(f"URL      : {job.get('url')}\n")
        f.write(f"Match    : {job.get('match_score')}%\n")
        f.write("\n" + "="*60 + "\n\n")
        f.write(cover_letter)

    print(f"   ✅ Saved: {output_path / f'{slug}_cover_letter.txt'}")
    return package


def process_top_jobs(
    jobs_path:    str   = str(DEFAULT_JOBS_PATH),
    profile_path: str   = str(DEFAULT_PROFILE_PATH),
    top_n:        int   = 5,
    min_score:    float = 55.0,
):
    """Process top N matched jobs and generate application packages."""

    for path in [jobs_path, profile_path]:
        if not os.path.exists(path):
            print(f"❌ File not found: {path}")
            sys.exit(1)

    with open(jobs_path)   as f: jobs    = json.load(f)
    with open(profile_path) as f: profile = json.load(f)

    eligible = [j for j in jobs if j.get("match_score", 0) >= min_score]
    top_jobs = eligible[:top_n]

    if not top_jobs:
        print(f"❌ No jobs with score >= {min_score}%. Total jobs: {len(jobs)}")
        sys.exit(1)

    print("=" * 60)
    print("✍️  COVER LETTER GENERATOR")
    print(f"👤 {profile.get('full_name', 'Unknown')}")
    print(f"📋 Processing top {len(top_jobs)} jobs (min score: {min_score}%)")
    print("=" * 60)

    results = []
    for job in top_jobs:
        package = generate_application(job, profile)
        results.append(package)

    print(f"\n{'='*60}")
    print(f"🎉 Done! {len(results)} application packages generated")
    print(f"📁 Saved in: data/applications/\n")
    for r in results:
        print(f"   • {r['job']['title']} @ {r['job']['company']}  [{r['job']['match_score']}%]")
        if r.get("missing_skills"):
            print(f"     ⚠️  Missing skills: {', '.join(r['missing_skills'][:3])}")


def load_preferences(path: str | None) -> dict:
    if not path:
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def process_single_job(
    job_path: str,
    profile_path: str,
    output_path: str,
    mode: str = "ai",
    settings_path: str | None = None,
) -> dict:
    """Generate a single application package and save it as JSON."""
    for path in [job_path, profile_path]:
        if not os.path.exists(path):
            print(f"❌ File not found: {path}")
            sys.exit(1)

    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    with open(profile_path, encoding="utf-8") as f:
        profile = json.load(f)

    package = generate_application_with_mode(
        job,
        profile,
        output_dir=None,
        mode=mode,
        preferences=load_preferences(settings_path),
    )

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(package, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved API result to: {output_path}")
    return package


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--single":
        if len(sys.argv) < 5:
            print("Usage: python ai_tools/cover_letter.py --single <job.json> <profile.json> <output.json> [--mode draft|ai] [--settings settings.json]")
            sys.exit(1)
        job_path = sys.argv[2]
        profile_path = sys.argv[3]
        output_path = sys.argv[4]
        mode = "ai"
        settings_path = None
        index = 5
        while index < len(sys.argv):
            arg = sys.argv[index]
            if arg == "--mode" and index+1 < len(sys.argv):
                mode = sys.argv[index+1]
                index += 2
                continue
            if arg == "--settings" and index+1 < len(sys.argv):
                settings_path = sys.argv[index+1]
                index += 2
                continue
            print("Usage: python ai_tools/cover_letter.py --single <job.json> <profile.json> <output.json> [--mode draft|ai] [--settings settings.json]")
            sys.exit(1)
        process_single_job(job_path, profile_path, output_path, mode=mode, settings_path=settings_path)
        sys.exit(0)

    jobs_path    = sys.argv[1] if len(sys.argv) > 1 else str(DEFAULT_JOBS_PATH)
    profile_path = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_PROFILE_PATH)
    top_n        = int(sys.argv[3])   if len(sys.argv) > 3 else 5
    min_score    = float(sys.argv[4]) if len(sys.argv) > 4 else 55.0

    process_top_jobs(jobs_path, profile_path, top_n, min_score)
