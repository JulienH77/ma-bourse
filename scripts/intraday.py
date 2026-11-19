"""Alertes de séance Telegram, sans accès au portefeuille du navigateur."""
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request
from zoneinfo import ZoneInfo
import json
import sys

from market import persist, positive, request_json, require, rules_from, save

STATE = Path(".github/intraday-alerts.json")


def signal(symbol, rule, quote, now):
    up, down, currency = rule
    if quote.get("status") == "error" or quote.get("currency") != currency:
        raise ValueError("Cotation indisponible ou devise incohérente")
    if quote.get("is_market_open") is not True:
        return None
    stamp = quote.get("last_update_at") or quote.get("last_quote_at") or quote.get("timestamp")
    if not stamp:
        raise ValueError("Horodatage du cours absent")
    instant = datetime.fromtimestamp(int(stamp), timezone.utc)
    if not 0 <= (now - instant).total_seconds() <= 30 * 60:
        return None
    price, previous = [Decimal(str(positive(float(quote[k])))) for k in ("close", "previous_close")]
    movement = (price - previous) * 100 / previous
    if -Decimal(str(down)) < movement < Decimal(str(up)):
        return None
    direction = "hausse" if movement > 0 else "baisse"
    local = instant.astimezone(ZoneInfo("Europe/Paris"))
    return (symbol + "/" + direction, local.date().isoformat(),
            f"{symbol} · {direction} de {abs(movement):.2f} % depuis la clôture précédente. "
            f"Cours {price} {currency} · {local:%d/%m à %H:%M} (Paris).")


def main():
    key, bot, chat = (require(k) for k in ("TWELVE_DATA_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"))
    rules = rules_from(require("WATCH_RULES"))
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    failures = 0
    for symbol, rule in rules.items():
        try:
            url = "https://api.twelvedata.com/quote?" + urlencode({"symbol": symbol})
            quote = request_json(Request(url, headers={"Authorization": "apikey " + key}))
            event = signal(symbol, rule, quote, datetime.now(timezone.utc))
            if event is None:
                continue
            identity, day, message = event
            if state.get(identity, "") >= day:
                continue
            body = urlencode({"chat_id": chat, "text": message}).encode()
            response = request_json(Request(f"https://api.telegram.org/bot{bot}/sendMessage", data=body))
            if response.get("ok") is not True:
                raise ValueError("Envoi refusé")
            state[identity] = day
            save(STATE, state)
            persist(STATE)
        except Exception as exc:
            failures += 1
            print("Vérification de séance incomplète :", type(exc).__name__, file=sys.stderr)
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
