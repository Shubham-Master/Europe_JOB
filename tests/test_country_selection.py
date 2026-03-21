import unittest

from scraper.adzuna import DEFAULT_TARGET_COUNTRIES, select_adzuna_countries
from scraper.rss_feeds import DEFAULT_RSS_LOCATIONS, select_rss_locations


class CountrySelectionTests(unittest.TestCase):
    def test_select_adzuna_countries_uses_supported_subset(self):
        profile = {"target_countries": ["ie", "pt", "de", "gb", "xx"]}
        self.assertEqual(select_adzuna_countries(profile), ["de", "gb"])

    def test_select_adzuna_countries_falls_back_to_defaults(self):
        profile = {"target_countries": ["ie", "pt", "xx"]}
        self.assertEqual(select_adzuna_countries(profile), DEFAULT_TARGET_COUNTRIES)

    def test_select_rss_locations_supports_expanded_europe(self):
        profile = {"target_countries": ["ie", "pt", "se", "lu"]}
        self.assertEqual(
            select_rss_locations(profile),
            ["Ireland", "Portugal", "Sweden", "Luxembourg"],
        )

    def test_select_rss_locations_falls_back_to_defaults(self):
        self.assertEqual(select_rss_locations({}), DEFAULT_RSS_LOCATIONS)


if __name__ == "__main__":
    unittest.main()
