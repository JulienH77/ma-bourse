import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import market


class MarketTests(unittest.TestCase):
    now = datetime(2026, 11, 17, 2, tzinfo=timezone.utc)
    days = ["2026-11-13", "2026-11-16"]

    def setUp(self):
        guard = patch("socket.socket", side_effect=AssertionError("Réseau interdit"))
        guard.start()
        self.addCleanup(guard.stop)
        self.rules = market.rules_from("")
        self.fetch = Mock(side_effect=[
            dict(zip(self.days, [100, 105])), dict(zip(self.days, [1.07, 1.09]))
        ])

    def test_build(self):
        feed = market.build(self.rules, self.now, self.fetch)
        self.assertEqual(feed["quotes"]["NVDA"], [
            dict(date=self.days[0], price=100, fx=1.07),
            dict(date=self.days[1], price=105, fx=1.09)])
        self.assertEqual(feed["currencies"], {"NVDA": "USD"})
        self.assertEqual(self.fetch.call_args.args, ("EUR/USD", date(2026, 11, 16)))

    def test_eur(self):
        feed = market.build({"ABC": (5, 3, "EUR")}, self.now, self.fetch)
        self.assertEqual(self.fetch.call_count, 1)
        self.assertEqual([row["fx"] for row in feed["quotes"]["ABC"]], [1, 1])

    def test_missing_historical_fx(self):
        with self.assertRaisesRegex(ValueError, "Change historique"):
            market.build(self.rules, self.now, Mock(side_effect=[
                dict.fromkeys(self.days, 100), {self.days[1]: 1.07}]))

    def test_rules(self):
        self.assertEqual(self.rules, {"NVDA": (5, 3, "USD")})
        for raw in ["{}", "[]", '{"NVDA":{"up":0}}', '{"NVDA":{"down":true}}',
                    '{"NVDA":{"currency":"usd"}}', '{"NVDA":{"up":NaN}}']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                market.rules_from(raw)

    def test_delivery_boundaries_and_replays(self):
        feed = market.build(self.rules, self.now, self.fetch)
        for price, expected in [(105, 1), (97, 1), (97.01, 0), (104.99, 0)]:
            with self.subTest(price=price):
                feed["quotes"]["NVDA"][-1]["price"] = price
                state, reserve, send = {}, Mock(), Mock()
                for _ in range(2):
                    market.deliver(feed, self.rules, state, reserve, send)
                self.assertEqual(send.call_count, expected)
                self.assertEqual(reserve.call_count, expected)

    def test_delivery_failures(self):
        feed = market.build(self.rules, self.now, self.fetch)
        send = Mock(side_effect=RuntimeError)
        with self.assertRaises(RuntimeError):
            market.deliver(feed, self.rules, {}, Mock(side_effect=RuntimeError), send)
        send.assert_not_called()
        state = {}
        with self.assertRaises(RuntimeError):
            market.deliver(feed, self.rules, state, Mock(), send)
        market.deliver(feed, self.rules, state, Mock(), send)
        send.assert_called_once()

    def test_unconsented_runs_stop_before_fetch(self):
        with patch("sys.argv", ["market", "--automated"]), patch.object(market, "build") as build:
            for env in [{}, {"STORE_MARKET_FEED": "true", "REPO_VISIBILITY": "public"}]:
                with patch.dict(os.environ, env, clear=True), self.assertRaises(ValueError):
                    market.main()
            build.assert_not_called()

    def test_local_export_and_failure_preserve_file(self):
        feed = market.build(self.rules, self.now, self.fetch)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "market.json"
            with patch("sys.argv", ["market", "--output", str(path)]), patch.dict(
                os.environ, {"ENABLE_TELEGRAM": "true"}, clear=True
            ), patch.object(market, "persist") as persist, patch.object(market, "build") as build:
                build.return_value = feed
                market.main()
                build.side_effect = RuntimeError("quota")
                with self.assertRaises(RuntimeError):
                    market.main()
                self.assertEqual(json.loads(path.read_text()), feed)
                persist.assert_not_called()


if __name__ == "__main__":
    unittest.main()
