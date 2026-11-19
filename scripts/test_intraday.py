import unittest
from datetime import datetime, timezone
from intraday import signal

class IntradayTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 18, 16, 30, tzinfo=timezone.utc)
        self.quote = dict(is_market_open=True, timestamp=self.now.timestamp(), previous_close="100", close="105", currency="USD")

    def event(self, **changes):
        return signal("NVDA", (5, 3, "USD"), self.quote | changes, self.now)

    def test_trigger_and_direction(self):
        self.assertEqual(self.event()[:2], ("NVDA/hausse", "2026-11-18"))
        self.assertIn("17:30", self.event()[2])
        self.assertEqual(self.event(close="97")[0], "NVDA/baisse")
        self.assertIsNone(self.event(close="104.99"))

    def test_no_stale_or_closed_signal(self):
        self.assertIsNone(self.event(timestamp=self.now.timestamp()-1801))
        self.assertIsNone(self.event(is_market_open=False))
        with self.assertRaises(ValueError):
            self.event(currency="EUR")
