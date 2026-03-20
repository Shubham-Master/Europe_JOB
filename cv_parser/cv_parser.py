"""
CV Parser Module - Europe Job Hunter
Extracts structured skills profile from a PDF CV using Gemini.
"""

import json
import os
import sys
from pathlib import Path

import pdfplumber

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai_tools.gemini_client import generate_json

DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "profile.json"


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract raw text from a PDF file."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()


def parse_cv_with_gemini(cv_text: str) -> dict:
    """
    Send CV text to Gemini API and extract a structured profile.
    Returns a dict with skills, experience, roles, and preferences.
    """
    prompt = f"""You are a CV/resume parser. Analyze the following CV text and extract a structured profile as JSON.

CV TEXT:
\"\"\"
{cv_text}
\"\"\"

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{{
  "full_name": "string or null",
  "contact": {{
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin": "string or null",
    "github": "string or null"
  }},
  "summary": "2-3 sentence professional summary",
  "current_title": "most recent job title",
  "seniority_level": "junior | mid | senior | lead | manager | director | unknown",
  "years_of_experience": number or null,
  "technical_skills": ["list", "of", "technical", "skills"],
  "soft_skills": ["list", "of", "soft", "skills"],
  "programming_languages": ["list", "of", "languages"],
  "frameworks_and_tools": ["list", "of", "frameworks", "and", "tools"],
  "domains": ["e.g. backend, frontend, data science, devops, finance, etc."],
  "industries": ["industries the person has worked in"],
  "education": [
    {{
      "degree": "string",
      "field": "string",
      "institution": "string",
      "year": number or null
    }}
  ],
  "languages": [
    {{
      "language": "string",
      "proficiency": "native | fluent | professional | intermediate | basic"
    }}
  ],
  "work_experience": [
    {{
      "title": "string",
      "company": "string",
      "location": "string or null",
      "start_date": "string or null",
      "end_date": "string or null (use 'present' if current)",
      "description": "brief summary"
    }}
  ],
  "target_roles": ["roles this person is likely targeting based on their experience"],
  "preferred_locations": ["any locations mentioned or inferred from CV"],
  "open_to_relocation": true or false,
  "visa_required": "unknown | yes | no",
  "top_keywords": ["10-15 most important keywords for job matching"]
}}

Rules:
- Return JSON only.
- Use null when a scalar field is unknown.
- Use [] when an array has no reliable values.
- Keep work_experience in reverse chronological order when possible.
- Do not invent companies, dates, or skills that are not supported by the CV text."""

    return normalize_profile(generate_json(prompt, max_tokens=2200, temperature=0.1))


def normalize_profile(profile: dict) -> dict:
    """Fill missing keys so downstream code gets a predictable structure."""
    contact = profile.get("contact", {}) if isinstance(profile.get("contact"), dict) else {}

    def list_of_strings(value):
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def list_of_dicts(value):
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def normalize_bool(value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"true", "yes", "y"}
        return False

    return {
        "full_name": profile.get("full_name"),
        "contact": {
            "email": contact.get("email"),
            "phone": contact.get("phone"),
            "location": contact.get("location"),
            "linkedin": contact.get("linkedin"),
            "github": contact.get("github"),
        },
        "summary": profile.get("summary"),
        "current_title": profile.get("current_title"),
        "seniority_level": profile.get("seniority_level", "unknown"),
        "years_of_experience": profile.get("years_of_experience"),
        "technical_skills": list_of_strings(profile.get("technical_skills")),
        "soft_skills": list_of_strings(profile.get("soft_skills")),
        "programming_languages": list_of_strings(profile.get("programming_languages")),
        "frameworks_and_tools": list_of_strings(profile.get("frameworks_and_tools")),
        "domains": list_of_strings(profile.get("domains")),
        "industries": list_of_strings(profile.get("industries")),
        "education": list_of_dicts(profile.get("education")),
        "languages": list_of_dicts(profile.get("languages")),
        "work_experience": list_of_dicts(profile.get("work_experience")),
        "target_roles": list_of_strings(profile.get("target_roles")),
        "preferred_locations": list_of_strings(profile.get("preferred_locations")),
        "open_to_relocation": normalize_bool(profile.get("open_to_relocation", False)),
        "visa_required": profile.get("visa_required", "unknown"),
        "top_keywords": list_of_strings(profile.get("top_keywords")),
    }


def save_profile(profile: dict, output_path: str) -> None:
    """Save the parsed profile as a JSON file."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)
    print(f"✅ Profile saved to: {output_path}")


def parse_cv(pdf_path: str, output_path: str = str(DEFAULT_OUTPUT_PATH)) -> dict:
    """
    Main function: parse a CV PDF and return + save the structured profile.

    Args:
        pdf_path: Path to the CV PDF file
        output_path: Where to save the JSON profile

    Returns:
        Parsed profile as a dictionary
    """
    print(f"📄 Reading CV from: {pdf_path}")
    cv_text = extract_text_from_pdf(pdf_path)

    if not cv_text:
        raise ValueError("Could not extract any text from the PDF. Is it a scanned image?")

    print(f"📝 Extracted {len(cv_text)} characters of text")
    print("🤖 Sending to Gemini for parsing...")

    profile = parse_cv_with_gemini(cv_text)

    save_profile(profile, output_path)

    print("\n🎯 Profile Summary:")
    print(f"   Name        : {profile.get('full_name', 'N/A')}")
    print(f"   Title       : {profile.get('current_title', 'N/A')}")
    print(f"   Seniority   : {profile.get('seniority_level', 'N/A')}")
    print(f"   Experience  : {profile.get('years_of_experience', 'N/A')} years")
    print(f"   Top Skills  : {', '.join(profile.get('technical_skills', [])[:5])}")
    print(f"   Languages   : {', '.join(profile.get('programming_languages', [])[:5])}")
    print(f"   Keywords    : {', '.join(profile.get('top_keywords', [])[:7])}")

    return profile


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python cv_parser.py <path_to_cv.pdf> [output_profile.json]")
        print("Example: python cv_parser.py my_cv.pdf data/profile.json")
        sys.exit(1)

    pdf_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_OUTPUT_PATH)

    if not os.path.exists(pdf_file):
        print(f"❌ File not found: {pdf_file}")
        sys.exit(1)

    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("❌ GEMINI_API_KEY environment variable not set.")
        print("   Get one at: https://aistudio.google.com/")
        sys.exit(1)

    parse_cv(pdf_file, output_file)
