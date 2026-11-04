import assert from 'node:assert/strict';
import { levelQuote, moneyInputCents } from '../src/lib/level-prices.ts';
const quotes = [
  {level:'first_time',hours:2,hourly_rate_cents:30000,total_cents:60000},
  {level:'returning',hours:2,hourly_rate_cents:40050,total_cents:80100},
  {level:'improving',hours:2,hourly_rate_cents:50000,total_cents:100000},
];
assert.equal(levelQuote(quotes,'returning',2).total_cents,80100);
assert.equal(levelQuote(quotes,'improving',2).total_cents,100000);
assert.equal(levelQuote(quotes,'first_time',3),undefined);
assert.equal(levelQuote(quotes.filter(q=>q.level!=='returning'),'returning',2),undefined);
assert.equal(levelQuote([{hours:2,total_cents:60000}],'improving',2).total_cents,60000);
for (const [raw, expected] of [['300',30000],['400.50',40050],['400,05',40005],['0',0],['10000.00',1000000]])
  assert.equal(moneyInputCents(raw),expected);
for (const raw of [null,'','-1','1e3','300.123','10.000,00','10000.01','Infinity'])
  assert.equal(moneyInputCents(raw),null);
console.log('PASS: level quotes cannot mix lesson rates; money inputs preserve exact centavos');
