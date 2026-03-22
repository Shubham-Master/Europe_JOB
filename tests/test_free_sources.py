import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

from scraper.company_sources import select_company_sources
from scraper.greenhouse import fetch_greenhouse_jobs
from scraper.keywords import build_search_keywords
from scraper.lever import fetch_lever_jobs
from scraper.profile_filters import generate_job_id
from scraper.remotive import fetch_remotive_jobs
from scraper.rss_feeds import fetch_indeed_rss, parse_rss_feed
from scraper.scraper import run_all_scrapers

FIXTURES = Path(__file__).parent / "fixtures"


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self._payload = payload
        self.text = payload if isinstance(payload, str) else json.dumps(payload)
        self.status_code = status_code
        self.headers = headers or {"content-type": "application/json"}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error")
        return None

    def json(self):
        if isinstance(self._payload, str):
            return json.loads(self._payload)
        return self._payload


class FreeSourceTests(unittest.TestCase):
    def test_build_search_keywords_supports_finance_profiles(self):
        profile = {
            "current_title": "Senior Finance Operations Analyst",
            "target_roles": ["Finance Analyst", "Operations Analyst"],
            "domains": ["finance", "operations"],
        }

        keywords = build_search_keywords(profile)

        self.assertIn("Senior Finance Operations Analyst", keywords)
        self.assertIn("Finance Analyst", keywords)
        self.assertTrue(any("financial analyst" == item.lower() for item in keywords))

    def test_build_search_keywords_supports_engineering_profiles(self):
        profile = {
            "current_title": "Senior Platform Engineer (Remote)",
            "target_roles": ["DevOps Engineer"],
            "domains": ["cloud", "devops"],
        }

        keywords = build_search_keywords(profile)

        self.assertIn("Senior Platform Engineer (Remote)", keywords)
        self.assertIn("DevOps Engineer", keywords)
        self.assertIn("Platform Engineer", keywords)

    def test_generate_job_id_is_stable_for_dedupe(self):
        url = "https://boards.greenhouse.io/example/jobs/123"
        self.assertEqual(generate_job_id(url), generate_job_id(url))

    def test_fetch_greenhouse_jobs_filters_fixture(self):
        payload = json.loads((FIXTURES / "greenhouse_jobs.json").read_text())
        source = {"company": "Example", "token_or_site": "example", "country_codes": ["de"]}

        with patch("scraper.greenhouse.requests.get", return_value=FakeResponse(payload)):
            jobs = fetch_greenhouse_jobs(source, ["Finance Analyst"], ["de"])

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["source"], "greenhouse")
        self.assertEqual(jobs[0]["country_code"], "de")

    def test_fetch_lever_jobs_filters_fixture(self):
        payload = json.loads((FIXTURES / "lever_jobs.json").read_text())
        source = {"company": "Example", "token_or_site": "example", "country_codes": ["nl"]}

        with patch("scraper.lever.requests.get", return_value=FakeResponse(payload)):
            jobs = fetch_lever_jobs(source, ["Product Manager"], ["nl"])

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["source"], "lever")
        self.assertEqual(jobs[0]["country_code"], "nl")

    def test_fetch_remotive_jobs_filters_fixture(self):
        payload = json.loads((FIXTURES / "remotive_jobs.json").read_text())

        with patch("scraper.remotive.requests.get", return_value=FakeResponse(payload)):
            jobs = fetch_remotive_jobs({}, ["Customer Success Manager"], ["gb", "de"])

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["source"], "remotive")
        self.assertEqual(jobs[0]["remote_type"], "remote")

    def test_parse_rss_feed_reads_fixture(self):
        xml_text = (FIXTURES / "indeed_feed.xml").read_text()
        jobs = parse_rss_feed(xml_text, "Germany", source="indeed_rss")

        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[0]["source"], "indeed_rss")
        self.assertEqual(jobs[0]["country"], "Germany")

    def test_fetch_indeed_rss_returns_empty_when_feed_is_blocked(self):
        html = "<html><body>blocked</body></html>"

        with patch(
            "scraper.rss_feeds.requests.get",
            return_value=FakeResponse(html, status_code=404, headers={"content-type": "text/html"}),
        ):
            jobs = fetch_indeed_rss("devops engineer", "Germany")

        self.assertEqual(jobs, [])

    def test_select_company_sources_prefers_country_overlap(self):
        profile = {"target_countries": ["de"], "current_title": "Finance Analyst"}
        sources = [
            {"company": "A", "adapter": "greenhouse", "token_or_site": "a", "country_codes": ["gb"], "role_tags": ["finance"]},
            {"company": "B", "adapter": "greenhouse", "token_or_site": "b", "country_codes": ["de"], "role_tags": ["finance"]},
        ]

        selected = select_company_sources(profile, sources)

        self.assertEqual([item["company"] for item in selected], ["B"])

    def test_run_all_scrapers_smoke_completes_without_adzuna(self):
        profile = {
            "full_name": "Alex Example",
            "current_title": "Operations Analyst",
            "target_roles": ["Operations Analyst"],
            "target_countries": ["de", "nl"],
        }

        ats_job = {
            "id": generate_job_id("https://boards.greenhouse.io/example/jobs/101"),
            "url": "https://boards.greenhouse.io/example/jobs/101",
            "title": "Operations Analyst",
            "company": "Example",
            "country": "Germany",
            "source": "greenhouse",
        }
        remotive_job = {
            "id": generate_job_id("https://remotive.com/remote-jobs/customer-success/customer-success-manager-301"),
            "url": "https://remotive.com/remote-jobs/customer-success/customer-success-manager-301",
            "title": "Customer Success Manager",
            "company": "RemoteCo",
            "country": "Remote",
            "source": "remotive",
        }

        with tempfile.TemporaryDirectory() as tmp_dir:
            profile_path = Path(tmp_dir) / "profile.json"
            output_path = Path(tmp_dir) / "jobs.json"
            profile_path.write_text(json.dumps(profile))

            with patch("scraper.scraper.scrape_company_sources_for_profile", return_value=[ats_job]), \
                 patch("scraper.scraper.fetch_remotive_jobs", return_value=[remotive_job]), \
                 patch("scraper.scraper.scrape_rss_for_profile", return_value=[ats_job]), \
                 patch("scraper.scraper.scrape_for_profile", side_effect=RuntimeError("Adzuna unavailable")):
                jobs = run_all_scrapers(str(profile_path), str(output_path))

            self.assertEqual(len(jobs), 2)
            self.assertTrue(output_path.exists())
            saved = json.loads(output_path.read_text())
            self.assertEqual(len(saved), 2)
            self.assertEqual(sorted(job["source"] for job in saved), ["greenhouse", "remotive"])


if __name__ == "__main__":
    unittest.main()
