import unittest

from ai_tools.cover_letter import (
    build_tailoring_draft,
    generate_application_with_mode,
    generate_cover_letter_draft,
)


PROFILE = {
    "full_name": "Shubham Kumar",
    "current_title": "Senior DevOps Engineer",
    "years_of_experience": 8,
    "technical_skills": ["AWS", "Kubernetes", "Terraform", "CI/CD"],
    "programming_languages": ["Python", "Go"],
    "frameworks_and_tools": ["Docker", "Grafana"],
    "domains": ["cloud", "platform"],
    "target_roles": ["Site Reliability Engineer", "Cloud Engineer"],
}

JOB = {
    "id": "job-1",
    "title": "Senior Cloud Platform Engineer",
    "company": "ExampleCorp",
    "location": "Berlin, Germany",
    "description": "Build Kubernetes and Terraform based AWS infrastructure, improve CI/CD delivery, and partner with platform teams.",
    "url": "https://example.com/jobs/1",
    "match_score": 52.0,
}


class CoverLetterModeTests(unittest.TestCase):
    def test_build_tailoring_draft_surfaces_overlap(self):
        result = build_tailoring_draft(JOB, PROFILE)

        self.assertTrue(result["tailored_bullets"])
        self.assertIn("AWS", result["keywords_to_add"])
        self.assertIn("Kubernetes", result["keywords_to_add"])

    def test_generate_cover_letter_draft_is_structured(self):
        result = generate_cover_letter_draft(JOB, PROFILE)

        self.assertIn("ExampleCorp", result)
        self.assertIn("Senior Cloud Platform Engineer", result)
        self.assertIn("Best regards,", result)

    def test_generate_application_with_mode_returns_draft_without_ai(self):
        result = generate_application_with_mode(JOB, PROFILE, output_dir=None, mode="draft")

        self.assertEqual(result["generation_mode"], "draft")
        self.assertTrue(result["cover_letter"])
        self.assertTrue(isinstance(result["tailored_bullets"], list))


if __name__ == "__main__":
    unittest.main()
