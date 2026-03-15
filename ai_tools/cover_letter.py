"""
Cover Letter Generator — Europe Job Hunter
Generates personalized cover letters and tailored CV bullets using Claude AI.

User Preferences:
- Length  : ~200 words
- Tone    : AI decides per job (startup vs corporate)
- Includes: Why this company + Skills match + Relocation willingness
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()


def call_claude(prompt: str, max_tokens: int = 1500) -> str:
    """Call Claude API and return text response."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


def generate_cover_letter(job: dict, profile: dict) -> str:
    """Generate a personalized ~200 word cover letter for a specific job."""

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

STRICT INSTRUCTIONS:
1. LENGTH: Exactly ~200 words. Not more, not less.
2. TONE: Analyze the job and company — adapt accordingly:
   - Startup / tech-forward → Friendly & Confident
   - Bank / enterprise / corporate → Professional & Formal  
   - Creative agency → Conversational & Direct
3. STRUCTURE (3 short paragraphs):
   Para 1 — Why THIS company specifically (show research, mention something specific)
   Para 2 — Top 2-3 skills that directly match the JD (be specific, use numbers if possible)
   Para 3 — Mention open to relocation to {job.get('location', 'Europe')} + strong call to action
4. Do NOT use "I am writing to express my interest" or any generic openers
5. Use the candidate's actual name — no placeholders
6. End with: "Best regards," followed by the candidate name
7. Write ONLY the letter body. No subject line, no date, no commentary.

Write the cover letter now:"""

    return call_claude(prompt, max_tokens=600)


def tailor_cv_bullets(job: dict, profile: dict) -> dict:
    """Rewrite CV bullets to match the job description (ATS-friendly)."""

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

    raw = call_claude(prompt, max_tokens=800)
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"tailored_bullets": [], "missing_skills": [], "keywords_to_add": [], "ats_score_estimate": 0}


def generate_application(job: dict, profile: dict, output_dir: str = "data/applications") -> dict:
    """Generate full application package: cover letter + tailored CV bullets."""

    company = job.get("company", "unknown").replace(" ", "_").lower()
    title   = job.get("title", "job").replace(" ", "_").lower()[:30]
    ts      = datetime.now().strftime("%Y%m%d_%H%M")
    slug    = f"{company}_{title}_{ts}"

    print(f"\n✍️  Generating: {job.get('title')} @ {job.get('company')}  [{job.get('match_score', 0)}%]")

    print("   📝 Writing cover letter (~200 words)...")
    cover_letter = generate_cover_letter(job, profile)

    print("   🎯 Tailoring CV bullets...")
    cv_data = tailor_cv_bullets(job, profile)

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
        "generated_at":       datetime.utcnow().isoformat(),
    }

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Save JSON
    with open(f"{output_dir}/{slug}.json", "w", encoding="utf-8") as f:
        json.dump(package, f, indent=2, ensure_ascii=False)

    # Save cover letter as plain text
    with open(f"{output_dir}/{slug}_cover_letter.txt", "w", encoding="utf-8") as f:
        f.write(f"Position : {job.get('title')} at {job.get('company')}\n")
        f.write(f"Location : {job.get('location')}\n")
        f.write(f"URL      : {job.get('url')}\n")
        f.write(f"Match    : {job.get('match_score')}%\n")
        f.write("\n" + "="*60 + "\n\n")
        f.write(cover_letter)

    print(f"   ✅ Saved: data/applications/{slug}_cover_letter.txt")
    return package


def process_top_jobs(
    jobs_path:    str   = "data/jobs_matched.json",
    profile_path: str   = "data/profile.json",
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


if __name__ == "__main__":
    jobs_path    = sys.argv[1] if len(sys.argv) > 1 else "data/jobs_matched.json"
    profile_path = sys.argv[2] if len(sys.argv) > 2 else "data/profile.json"
    top_n        = int(sys.argv[3])   if len(sys.argv) > 3 else 5
    min_score    = float(sys.argv[4]) if len(sys.argv) > 4 else 55.0

    process_top_jobs(jobs_path, profile_path, top_n, min_score)
