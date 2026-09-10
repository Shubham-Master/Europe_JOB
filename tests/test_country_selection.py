import unittest

from scraper.adzuna import DEFAULT_TARGET_COUNTRIES, select_adzuna_countries
from scraper.profile_filters import location_matches_country_codes
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


class RemoteLocationFilteringTests(unittest.TestCase):
    def test_unscoped_remote_outside_target_countries_is_rejected(self):
        self.assertFalse(
            location_matches_country_codes("Remote, Canada; Remote, United States", ["nl", "ch"])
        )

    def test_europe_scoped_remote_is_accepted(self):
        self.assertTrue(location_matches_country_codes("Remote, Europe", ["nl", "ch"]))

    def test_emea_scoped_remote_is_accepted(self):
        self.assertTrue(location_matches_country_codes("Remote (EMEA)", ["nl", "ch"]))

    def test_bare_remote_no_longer_auto_passes(self):
        self.assertFalse(location_matches_country_codes("Remote", ["nl", "ch"]))

    def test_matching_target_country_name_is_accepted(self):
        self.assertTrue(location_matches_country_codes("Amsterdam, Netherlands", ["nl", "ch"]))


if __name__ == "__main__":
    unittest.main()
