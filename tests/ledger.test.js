'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { positions } = require('../docs/ledger');
const buy = { symbol: 'ABC', currency: 'USD', side: 'buy', qty: 10, price: 20,
  fx: 2, fee: 2, date: '2024-02-29T10:00' };
const quote = { date: '2024-03-01', price: 60, fx: 2 };
const sell = { ...buy, side: 'sell', date: '2024-03-01T10:00' };

test('weighted EUR basis, EUR fees, quote FX and chronological processing', () => {
  const second = { ...buy, date: '2024-02-29T15:00', price: 84, fx: 4, fee: 8 };
  const sale = { ...sell, qty: 5, price: 81, fx: 3, fee: 3 };
  const trades = Object.freeze([sale, buy, second]);
  const quotes = { ABC: Object.freeze([quote, { ...quote, date: '2024-02-29', price: 6 }]) };
  assert.deepEqual(positions(trades, quotes), [
    { symbol: 'ABC', currency: 'USD', qty: 15, cost: 240, value: 450, pnl: 210, realized: 52 }
  ]);
});

test('missing and pre-opening quotes, same-day quotes, liquidation and repurchase', () => {
  const old = { ABC: [{ ...quote, date: '2024-02-28' }] };
  for (const history of [{}, { ABC: [] }, old]) {
    const [p] = positions([buy], history);
    assert.deepEqual([p.value, p.pnl], [null, null]);
  }
  const closed = positions([buy, sell], { ABC: [quote] })[0];
  assert.deepEqual([closed.qty, closed.cost, closed.value, closed.pnl, closed.realized],
    [0, 0, 0, 0, -4]);
  const reopen = { ...buy, date: '2024-03-02T12:00' };
  const [p] = positions([buy, sell, reopen], { ABC: [quote] });
  assert.deepEqual([p.cost, p.value, p.pnl, p.realized], [102, null, null, -4]);
  assert.equal(positions([buy], { ABC: [{ ...quote, date: '2024-02-29' }] })[0].value, 300);
});

test('fractional quantities, exact liquidation and strict oversell', () => {
  const trades = [0.1, 0.2].map(qty => ({ ...buy, qty }));
  assert.equal(positions([...trades, { ...sell, qty: 0.3 }], {})[0].cost, 0);
  assert.throws(() => positions([...trades, { ...sell, qty: 0.30000000000000004 }], {}), /Oversell/);
  assert.throws(() => positions([buy, { ...sell, date: '2024-02-28T10:00' }], {}), /Oversell/);
});

test('stable ordering for tied minutes and independent ticker books', () => {
  const sameTime = { ...sell, date: buy.date };
  assert.throws(() => positions([sameTime, buy], {}), /Oversell/);
  const other = { ...buy, symbol: '__proto__', currency: 'EUR' };
  const result = positions([buy, other, sameTime], { ['__proto__']: [quote] });
  assert.deepEqual(result.map(p => [p.symbol, p.qty, p.value]), [['ABC', 0, null], ['__proto__', 10, 300]]);
  assert.throws(() => positions([buy, sell, { ...buy, date: sell.date, currency: 'EUR' }], {}), /Currency/);
});

test('invalid containers, trades and quote histories', () => {
  for (const args of [[{}, {}], [[], []], [[], null], [Array(2), {}], [[], { ABC: {} }]]) {
    assert.throws(() => positions(...args));
  }
  for (const patch of [{ symbol: ' ' }, { currency: 'usd' }, { side: 'hold' }, { qty: 0 },
    { qty: '10' }, { fx: 0 }, { fee: -1 }, { price: Infinity }, { date: '2023-02-29T10:00' },
    { date: '2024-03-31T02:30' }, { date: '2024-01-01T24:00' }, { date: '2024-03-01T10:00Z' }]) {
    assert.throws(() => positions([{ ...buy, ...patch }], {}));
  }
  for (const key of Object.keys(buy)) {
    const t = { ...buy };
    delete t[key];
    assert.throws(() => positions([t], {}));
  }
  for (const history of [[quote, quote], [null], [{ ...quote, fx: NaN }], [{ ...quote, price: -1 }],
    [{ ...quote, date: '2024-04-31' }], [{ ...quote, date: buy.date }]]) {
    assert.throws(() => positions([], { ABC: history }));
  }
  assert.doesNotThrow(() => positions([{ ...buy, date: '2024-10-27T02:30' }], {}));
});

test('standalone browser script exposes the same calculation', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../docs/ledger'), 'utf8'), context);
  const result = context.window.Ledger.positions([buy], { ABC: [quote] });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), positions([buy], { ABC: [quote] }));
});

test('history skips dates before prices exist and values only shares held that day', () => {
  const ledger = require('../docs/ledger.js');
  const buy = {symbol:'NVDA', currency:'USD', side:'buy', qty:1, price:100, fx:1, fee:0, date:'2026-10-01T12:00'};
  const trades = [buy, {...buy, side:'sell', qty:0.25, date:'2026-10-03T14:00'}];
  const quotes = {NVDA:[{date:'2026-10-02',price:110,fx:1.1},{date:'2026-10-03',price:120,fx:1.2}]};
  const series = ledger.history(trades, quotes, 30);
  assert.deepEqual(series.map(p=>p[0]), ['2026-10-02','2026-10-03']);
  assert.ok(Math.abs(series[0][1]-100)<1e-9);
  assert.ok(Math.abs(series[1][1]-75)<1e-9);
});
