import assert from 'node:assert/strict';
import { safeCsvCell, financeCsv } from '../src/lib/sandbox-finance-csv.mjs';
for (const input of ['=SUM(1,1)', '+cmd', '-1+2', '@SUM(1)', '\t=SUM(1)', '\r@cmd', '  =2+2']) {
  assert.equal(safeCsvCell(input), `"'${input}"`);
}
assert.equal(safeCsvCell('a"b'), '"a""b"');
assert.equal(safeCsvCell('normal'), '"normal"');
const csv = financeCsv([{ name: '=HYPERLINK("evil")', cents: 1234, note: 'a;\nb' }], [{ key: 'name', label: 'Nome' }, { key: 'cents', label: 'Centavos' }, { key: 'note', label: 'Nota' }]);
assert.ok(csv.startsWith('\uFEFF"Nome";"Centavos";"Nota"\r\n'));
assert.ok(csv.includes('"\'=HYPERLINK(""evil"")";"1234";"a;\nb"'));
assert.ok(csv.endsWith('\r\n'));
assert.throws(() => financeCsv([], []), /invalid_csv_schema/);
assert.throws(() => financeCsv([null], [{key:'x',label:'X'}]), /invalid_csv_row/);
console.log('sandbox finance CSV safety PASS');
