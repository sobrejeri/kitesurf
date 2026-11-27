import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Read the fixture expression actually executed by the SQL suite. This models
// only the historical civil-day / current 24h clock guards at fixed instants;
// actual authentication/PIN/RPC execution remains covered by test-db.sh.
const source=readFileSync(new URL('../supabase/tests/10_rules.test.sql',import.meta.url),'utf8');
const expression=/update public\.booking_meetings set starts_at = ([^\n;]+)\n\s+where id = m;/.exec(source)?.[1]?.trim();
assert.ok(expression,'presence fixture clock expression must be found');
const evaluate=(expr,clock)=>{
  if(expr==='now()')return clock;
  const hours=/^now\(\)\s*\+\s*interval '(\d+) hour(?:s)?'$/.exec(expr);
  if(hours)return clock+Number(hours[1])*3600_000;
  throw new Error('unsupported fixture expression; update its deterministic boundary proof');
};
const day=(ms)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const cases=[['22:59',true],['23:00',false],['23:59',false],['00:00',true]];
for(const [time,oldAllowed]of cases){
  const clock=Date.parse('2026-11-26T'+time+':00-03:00');
  const before=evaluate("now() + interval '1 hour'",clock);
  assert.equal(day(before)<=day(clock),oldAllowed,'control proves the original midnight defect at '+time);
  const actual=evaluate(expression,clock);
  assert.equal(day(actual),day(clock),'real fixture must remain on the historical allowed civil day at '+time);
  assert.ok(actual<=clock+24*3600_000,'real fixture must also satisfy the new upper time window at '+time);
}
console.log('PASS: actual presence fixture clock is valid at 22:59/23:00/23:59/00:00 Fortaleza; old +1h fails the two late-night controls. SQL RPC/PIN tests run separately.');
