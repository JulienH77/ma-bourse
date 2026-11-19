(function () {
  'use strict';

  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
  const minutePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const paris = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  function record(value, path) {
    if (Object.prototype.toString.call(value) !== '[object Object]' ||
        (Object.getPrototypeOf(value) !== null &&
         Object.getPrototypeOf(Object.getPrototypeOf(value)) !== null)) {
      throw new TypeError(path + ' must be a record');
    }
  }

  function symbolKey(value, path) {
    if (typeof value !== 'string' || !value || value.trim() !== value) {
      throw new TypeError(path + ' must be a nonempty, trimmed symbol');
    }
  }

  function number(value, path, positive = false) {
    if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
      throw new RangeError(path + ' must be finite and ' + (positive ? 'positive' : 'nonnegative'));
    }
  }

  function calendar(value, timed, path) {
    const pattern = timed ? minutePattern : dayPattern;
    if (typeof value !== 'string' || !pattern.test(value) || value.startsWith('0000')) {
      throw new RangeError(path + ' has invalid date format');
    }
    const iso = (timed ? value : value + 'T00:00') + ':00.000Z';
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== iso) {
      throw new RangeError(path + ' has invalid calendar date or time');
    }
    if (!timed) return;

    // Recover the local UTC offset, then check that the wall time exists.
    // At a spring transition the skipped hour cannot round-trip.
    const localMillis = instant => {
      const p = Object.fromEntries(paris.formatToParts(instant).map(x => [x.type, x.value]));
      return Date.parse(p.year.padStart(4, '0') + '-' + p.month + '-' + p.day +
        'T' + p.hour + ':' + p.minute + ':' + p.second + 'Z');
    };
    for (const probe of [ms, ms - 86400000]) {
      if (localMillis(ms - (localMillis(probe) - probe)) === ms) return;
    }
    throw new RangeError(path + ' does not exist in Europe/Paris');
  }

  // All finite JS quantities have decimal representations with at most 324
  // fractional places. Exact inventory prevents rounding dust and oversells.
  function quantityUnits(qty) {
    const [mantissa, exponent = '0'] = String(qty).split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    return BigInt(whole + fraction) * 10n ** BigInt(324 + Number(exponent) - fraction.length);
  }

  function finite(value) {
    if (!Number.isFinite(value)) throw new RangeError('Ledger arithmetic overflow');
    return value;
  }

  function positions(trades, quotes) {
    if (!Array.isArray(trades)) throw new TypeError('trades must be an array');
    record(quotes, 'quotes');
    const latest = new Map();
    for (const symbol of Reflect.ownKeys(quotes)) {
      symbolKey(symbol, 'quotes key');
      const history = quotes[symbol];
      if (!Array.isArray(history)) throw new TypeError('quotes.' + symbol + ' must be an array');
      const dates = new Set();
      for (const q of history) {
        const path = 'quotes.' + symbol;
        record(q, path);
        calendar(q.date, false, path + '.date');
        number(q.price, path + '.price');
        number(q.fx, path + '.fx', true);
        if (dates.has(q.date)) throw new RangeError(path + ' has duplicate date ' + q.date);
        dates.add(q.date);
        if (!latest.has(symbol) || q.date > latest.get(symbol).date) latest.set(symbol, q);
      }
    }

    const ordered = Array.from(trades, (t, i) => {
      const path = 'trades[' + i + ']';
      record(t, path);
      symbolKey(t.symbol, path + '.symbol');
      if (typeof t.currency !== 'string' || !/^[A-Z]{3}$/.test(t.currency)) {
        throw new TypeError(path + '.currency must be a three-letter uppercase code');
      }
      if (t.side !== 'buy' && t.side !== 'sell') throw new TypeError(path + '.side is invalid');
      calendar(t.date, true, path + '.date');
      number(t.qty, path + '.qty', true);
      number(t.fx, path + '.fx', true);
      number(t.price, path + '.price');
      number(t.fee, path + '.fee');
      return t;
    }).sort((a, b) => a.date < b.date ? -1 : Number(a.date > b.date));

    const books = new Map();
    for (const t of ordered) {
      if (!books.has(t.symbol)) {
        books.set(t.symbol, { currency: t.currency, units: 0n, cost: 0, realized: 0 });
      }
      const book = books.get(t.symbol);
      if (book.currency !== t.currency) throw new RangeError('Currency mismatch for ' + t.symbol);
      const units = quantityUnits(t.qty);
      const gross = finite(t.qty * (t.price / t.fx));
      if (t.side === 'buy') {
        if (book.units === 0n) book.opened = t.date.slice(0, 10);
        book.units += units;
        book.cost = finite(book.cost + (gross + t.fee));
      } else {
        if (units > book.units) throw new RangeError('Oversell for ' + t.symbol + ' at ' + t.date);
        const qty = finite(Number(book.units + 'e-324'));
        const remaining = book.units - units;
        // Calculate the smaller leg directly to avoid loss of precision near liquidation.
        const smallQty = Number((units < remaining ? units : remaining) + 'e-324');
        const smallCost = book.cost * (smallQty / qty);
        const basis = units <= remaining ? smallCost : book.cost - smallCost;
        book.cost = units <= remaining ? book.cost - basis : smallCost;
        book.realized = finite(book.realized + (gross - t.fee - basis));
        book.units = remaining;
      }
    }

    return Array.from(books, ([symbol, b]) => {
      const qty = finite(Number(b.units + 'e-324'));
      const q = latest.get(symbol);
      const priced = q && q.date >= b.opened;
      const value = priced ? finite(qty * (q.price / q.fx)) : null;
      return { symbol, currency: b.currency, qty, cost: b.cost, value,
        pnl: priced ? finite(value - b.cost) : null, realized: b.realized };
    });
  }

  function validate(trades, quotes) {
    positions(trades, quotes);
  }

  // Traverse each trade and daily observation once. Inventory uses the same
  // exact fractional units as the current portfolio. Missing prices leave a gap.
  function history(trades, quotes, range) {
    const calendar = new Map();
    const tracked = new Set(trades.map(t => t.symbol));
    function dayEvents(day) {
      if (!calendar.has(day)) calendar.set(day, { trades: [], quotes: [] });
      return calendar.get(day);
    }
    for (const trade of trades) dayEvents(trade.date.slice(0, 10)).trades.push(trade);
    for (const [symbol, series] of Object.entries(quotes)) {
      if (tracked.has(symbol)) {
        for (const quote of series) dayEvents(quote.date).quotes.push([symbol, quote]);
      }
    }
    const days = [...calendar.keys()].sort();
    if (!days.length) return [];
    const cutoff = Date.parse(days.at(-1)) - (range - 1) * 86400000;
    const books = new Map(), latest = new Map(), result = [];
    for (const day of days) {
      const events = calendar.get(day);
      events.trades.sort((a, b) => a.date.localeCompare(b.date));
      for (const trade of events.trades) {
        const book = books.get(trade.symbol) || {units: 0n};
        if (book.units === 0n) book.opened = day;
        const units = quantityUnits(trade.qty);
        book.units += trade.side === 'buy' ? units : -units;
        books.set(trade.symbol, book);
      }
      for (const [symbol, quote] of events.quotes) latest.set(symbol, quote);
      if (!books.size || Date.parse(day) < cutoff) continue;
      let value = 0, complete = true;
      for (const [symbol, book] of books) {
        if (!book.units) continue;
        const q = latest.get(symbol);
        if (!q || q.date < book.opened) { complete = false; break; }
        value += Number(book.units + 'e-324') * (q.price / q.fx);
      }
      if (complete) result.push([day, finite(value)]);
    }
    return result;
  }

  const Ledger = { positions, validate, history };
  if (typeof window !== 'undefined') window.Ledger = Ledger;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ledger;
})();
