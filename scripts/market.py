"""Daily Twelve Data feed and opt-in Telegram delivery. Python 3.11+."""
import argparse
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

FEED = Path("docs/market.json")
STATE = Path(".github/market-alerts.json")


def require(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Secret absent : {name}")
    return value


def positive(value):
    if type(value) not in (float, int) or not math.isfinite(value) or value <= 0:
        raise ValueError("Nombre positif fini attendu")
    return value


def rules_from(raw):
    rules = json.loads(raw or '{"NVDA":{"currency":"USD"}}')
    if not isinstance(rules, dict) or not rules:
        raise ValueError("WATCH_RULES doit contenir des symboles")
    result = {}
    for symbol, rule in rules.items():
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9.:-]{0,23}", symbol):
            raise ValueError("Symbole invalide")
        if not isinstance(rule, dict) or set(rule) - {"up", "down", "currency"}:
            raise ValueError("Règle invalide")
        currency = rule.get("currency", "USD")
        if not isinstance(currency, str) or not re.fullmatch("[A-Z]{3}", currency):
            raise ValueError("Devise invalide")
        result[symbol] = (positive(rule.get("up", 5)), positive(rule.get("down", 3)), currency)
    return result


def request_json(req):
    try:
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"Erreur HTTP {exc.code}") from None
    except (OSError, ValueError) as exc:
        raise RuntimeError(f"Réponse réseau inutilisable ({type(exc).__name__})") from None


def series(symbol, cutoff, currency=None):
    params = urlencode(dict(symbol=symbol, interval="1day", outputsize=390,
                            end_date=cutoff.isoformat(), adjust="splits"))
    req = Request("https://api.twelvedata.com/time_series?" + params,
                  headers={"Authorization": "apikey " + require("TWELVE_DATA_API_KEY")})
    data = request_json(req)
    if not isinstance(data.get("values"), list):
        raise ValueError("Série Twelve Data absente, vérifier symbole, quota et abonnement")
    if currency and data.get("meta", {}).get("currency") != currency:
        raise ValueError("Devise du titre différente de WATCH_RULES")
    result = {}
    for row in data["values"]:
        day = date.fromisoformat(row["datetime"])
        if day <= cutoff:
            if day.isoformat() in result:
                raise ValueError("Date dupliquée")
            result[day.isoformat()] = positive(float(row["close"]))
    if not result:
        raise ValueError("Série vide")
    return result


def build(rules, now, fetch=series):
    from datetime import timedelta
    cutoff = now.date() - timedelta(days=1)
    quotes, currencies, rates = {}, {}, {}
    for symbol, (_, _, currency) in rules.items():
        closes = fetch(symbol, cutoff, currency)
        if currency != "EUR" and currency not in rates:
            rates[currency] = fetch("EUR/" + currency, cutoff)
        rows = []
        # Keep about one trading year, with extra FX history for holiday differences.
        for day in sorted(closes)[-252:]:
            fx = 1 if currency == "EUR" else rates[currency].get(day)
            if fx is None:
                raise ValueError(f"Change historique absent pour le {day}")
            rows.append(dict(date=day, price=closes[day], fx=fx))
        if len(rows) < 2:
            raise ValueError("Deux clôtures sont nécessaires")
        quotes[symbol], currencies[symbol] = rows, currency
    return dict(quotes=quotes, currencies=currencies, updated=now.isoformat())


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", dir=path.parent, delete=False) as out:
        json.dump(data, out, indent=2, allow_nan=False)
        out.write("\n")
    os.replace(out.name, path)


def persist(path):
    def git(*args):
        return subprocess.run(["git", *args], check=True, capture_output=True)
    git("add", "--", str(path))
    git("commit", "-m", "Actualisation automatique du marché", "--", str(path))
    git("push", "origin", "HEAD:refs/heads/" + require("GITHUB_REF_NAME"))


def deliver(feed, rules, state, reserve, send):
    for symbol, (up, down, currency) in rules.items():
        prev, last = feed["quotes"][symbol][-2:]
        key = hashlib.sha256(symbol.encode()).hexdigest()
        if state.get(key, "") >= last["date"]:
            continue
        before, after = (Decimal(str(row["price"])) for row in (prev, last))
        change = (after - before) * 100 / before
        if -Decimal(str(down)) < change < Decimal(str(up)):
            continue
        state[key] = last["date"]
        reserve(state)
        send(f"{symbol} · {last['date']} · {last['price']} {currency} · {change:+.2f} %")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=FEED)
    parser.add_argument("--automated", action="store_true")
    args = parser.parse_args()
    rules = rules_from(os.getenv("WATCH_RULES"))
    if args.automated:
        if os.getenv("STORE_MARKET_FEED") != "true":
            raise ValueError("Stockage du flux non autorisé")
        if os.getenv("REPO_VISIBILITY") != "private" and os.getenv("ALLOW_PUBLIC_FEED") != "true":
            raise ValueError("Publication non autorisée")
    alerts = args.automated and os.getenv("ENABLE_TELEGRAM") == "true"
    if alerts:
        token, chat = require("TELEGRAM_BOT_TOKEN"), require("TELEGRAM_CHAT_ID")
    feed = build(rules, datetime.now(timezone.utc))
    prior = json.loads(args.output.read_text()) if args.output.exists() else {}
    if any(feed[k] != prior.get(k) for k in ("quotes", "currencies")):
        save(args.output, feed)
        if args.automated:
            persist(args.output)
    if alerts:
        state = json.loads(STATE.read_text()) if STATE.exists() else {}

        def reserve(records):
            save(STATE, records)
            persist(STATE)

        def send(message):
            data = urlencode(dict(chat_id=chat, text=message)).encode()
            reply = request_json(Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data))
            if reply.get("ok") is not True:
                raise ValueError("Telegram a refusé le message")

        deliver(feed, rules, state, reserve, send)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never print request URLs, provider responses, chat IDs or secret rules.
        print("Échec du flux :", str(exc) if type(exc) in (ValueError, RuntimeError)
              else type(exc).__name__, file=sys.stderr)
        sys.exit(1)
