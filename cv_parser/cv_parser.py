"""
CV Parser Module - Europe Job Hunter
Extracts structured skills profile from a PDF CV using Claude AI.
"""

import json
import os
import re
import sys
from pathlib import Path

import anthropic
import pdfplumber


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract raw text from a PDF file."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()


def parse_cv_with_claude(cv_text: str) -> dict:
    """
    Send CV text to Claude API and extract a structured profile.
    Returns a dict with skills, experience, roles, and preferences.
    """
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

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
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    return json.loads(raw)


def save_profile(profile: dict, output_path: str) -> None:
    """Save the parsed profile as a JSON file."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)
    print(f"✅ Profile saved to: {output_path}")


def parse_cv(pdf_path: str, output_path: str = "data/profile.json") -> dict:
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
    print("🤖 Sending to Claude for parsing...")

    profile = parse_cv_with_claude(cv_text)

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
    output_file = sys.argv[2] if len(sys.argv) > 2 else "data/profile.json"

    if not os.path.exists(pdf_file):
        print(f"❌ File not found: {pdf_file}")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ ANTHROPIC_API_KEY environment variable not set.")
        print("   Get your key at: https://console.anthropic.com/")
        sys.exit(1)

    parse_cv(pdf_file, output_file)
