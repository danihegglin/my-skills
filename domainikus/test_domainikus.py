"""Offline tests: every network call is replaced with a fake."""

import time
import unittest
from unittest import mock

import domainikus as dk


def fake_http(routes):
    """Return an http_get_json stand-in. routes maps a URL substring to a response or an HTTP status."""
    calls = []

    def get(url, accept="application/json", timeout=10.0):
        calls.append(url)
        for part, resp in routes.items():
            if part in url:
                if isinstance(resp, int):
                    raise dk.HttpError(resp)
                return resp
        raise OSError(f"unrouted: {url}")

    get.calls = calls
    return get


BOOTSTRAP = {"services": [[["com", "net"], ["https://rdap.example/com/"]]]}


class NamesTest(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(dk.slugify("Bäckerei Zürich!"), "baeckereizuerich")
        self.assertEqual(dk.slugify("Café-Crème"), "cafe-creme")
        self.assertEqual(dk.slugify("--x--"), "x")

    def test_normalize_domain(self):
        self.assertEqual(dk.normalize_domain("https://www.Example.com/path"), "example.com")
        self.assertEqual(dk.normalize_domain("bäckerei.ch"), "xn--bckerei-5wa.ch")
        self.assertIsNone(dk.normalize_domain("bad_name.com"))
        self.assertIsNone(dk.normalize_domain("-bad.com"))
        self.assertIsNone(dk.normalize_domain("nodot"))

    def test_keywords_drop_stopwords_in_english_and_german(self):
        self.assertEqual(dk.extract_keywords("An app to book dog walkers nearby"), ["book", "dog", "walkers", "nearby"])
        self.assertEqual(dk.extract_keywords("Eine Bäckerei mit frischem Brot"), ["baeckerei", "frischem", "brot"])

    def test_expand(self):
        self.assertEqual(dk.expand(["foo", "bar.io"], ["com", "ch"]), ["foo.com", "foo.ch", "bar.io"])

    def test_display(self):
        self.assertEqual(dk.display("xn--bckerei-5wa.ch"), "bäckerei.ch")


class GenerateTest(unittest.TestCase):
    def setUp(self):
        self.cache = dk.Cache(":memory:")

    def test_offline_generation_ranks_combinations_first(self):
        names = dk.generate("dog walkers", self.cache, synonyms=False, affixes=False)
        self.assertEqual(names[0].name, "dogwalkers")
        self.assertEqual(names[0].source, "input")
        self.assertIn("walkersdog", [c.name for c in names])
        self.assertEqual({c.source for c in names[-2:]}, {"keyword"})

    def test_single_name_and_extras(self):
        names = dk.generate("coolname.com", self.cache, synonyms=False, affixes=True, extra=["Other Name"])
        got = [c.name for c in names]
        self.assertEqual(got[:2], ["coolname", "othername"])
        self.assertIn("getcoolname", got)

    def test_synonyms_are_filtered_and_cached(self):
        http = fake_http({
            "sp=fast": [{"word": "fast", "tags": ["f:80"]}],
            "ml=fast": [
                {"word": "quick", "tags": ["syn", "f:28.9"]},
                {"word": "alacritous", "tags": ["syn", "f:0.001"]},  # too rare
                {"word": "go after", "tags": ["f:5"]},
                {"word": "the", "tags": ["f:900"]},  # stopword
            ],
        })
        with mock.patch.object(dk, "http_get_json", http):
            self.assertEqual(dk.related_words("fast", self.cache), ["quick", "goafter"])
            n = len(http.calls)
            self.assertEqual(dk.related_words("fast", self.cache), ["quick", "goafter"])
            self.assertEqual(len(http.calls), n)  # served from SQLite

    def test_non_english_words_skip_synonyms(self):
        http = fake_http({"sp=brot": [{"word": "brother", "tags": ["f:50"]}]})
        with mock.patch.object(dk, "http_get_json", http):
            self.assertEqual(dk.related_words("brot", self.cache), [])
        self.assertFalse(any("ml=" in u for u in http.calls))


class CheckerTest(unittest.TestCase):
    def setUp(self):
        self.cache = dk.Cache(":memory:")

    def run_check(self, routes, domains, refresh=False):
        http = fake_http({"data.iana.org": BOOTSTRAP, **routes})
        with mock.patch.object(dk, "http_get_json", http):
            return dk.Checker(self.cache, workers=2, refresh=refresh).check(domains), http

    def test_rdap_status_mapping(self):
        res, _ = self.run_check(
            {"/domain/taken.com": {"status": ["active"]}, "/domain/free.com": 404},
            ["taken.com", "free.com"],
        )
        self.assertEqual(res["taken.com"].status, "taken")
        self.assertEqual(res["free.com"].status, "available")
        self.assertEqual(res["free.com"].source, "rdap")

    def test_ch_uses_switch_rdap_override(self):
        res, http = self.run_check({"rdap.nic.ch/domain/frei.ch": 404}, ["frei.ch"])
        self.assertEqual(res["frei.ch"].status, "available")

    def test_dns_fallback_for_tlds_without_rdap(self):
        res, _ = self.run_check(
            {
                "name=taken.co": {"Status": 0, "Answer": [{"data": "ns1.example."}]},
                "name=free.co": {"Status": 3},
            },
            ["taken.co", "free.co"],
        )
        self.assertEqual((res["taken.co"].status, res["taken.co"].source), ("taken", "dns"))
        self.assertEqual(res["free.co"].status, "likely_available")

    def test_rdap_error_falls_back_to_dns(self):
        res, _ = self.run_check(
            {"/domain/x.com": 503, "name=x.com": {"Status": 0, "Answer": [{"data": "ns."}]}},
            ["x.com"],
        )
        self.assertEqual((res["x.com"].status, res["x.com"].source), ("taken", "dns"))

    def test_results_are_cached_and_refresh_bypasses_cache(self):
        self.run_check({"/domain/a.com": 404}, ["a.com"])
        res, http = self.run_check({}, ["a.com"])
        self.assertTrue(res["a.com"].cached)
        self.assertEqual(http.calls, [])
        res, http = self.run_check({"/domain/a.com": {"status": []}}, ["a.com"], refresh=True)
        self.assertEqual(res["a.com"].status, "taken")

    def test_unknown_results_are_not_cached(self):
        self.run_check({}, ["nowhere.co"])  # every request fails
        self.assertIsNone(self.cache.get_domain("nowhere.co"))

    def test_invalid_domain(self):
        res, http = self.run_check({}, ["bad_name.com"])
        self.assertEqual(res["bad_name.com"].status, "invalid")
        self.assertEqual(http.calls, [])


class CacheTest(unittest.TestCase):
    def test_ttl_expiry_and_clear(self):
        cache = dk.Cache(":memory:")
        old = time.time() - dk.TTL["available"] - 10
        cache.put_domain(dk.CheckResult("old.com", "available", "rdap", checked_at=old))
        cache.put_domain(dk.CheckResult("new.com", "taken", "rdap"))
        self.assertIsNone(cache.get_domain("old.com"))
        self.assertEqual(cache.get_domain("new.com")["status"], "taken")
        self.assertEqual(cache.clear(expired_only=True), 1)
        self.assertEqual(cache.stats()["taken"], 1)

    def test_history(self):
        cache = dk.Cache(":memory:")
        cache.log_search("dog walkers", ["com"], ["dogwalkers"])
        self.assertEqual(cache.history()[0]["query"], "dog walkers")


if __name__ == "__main__":
    unittest.main()
