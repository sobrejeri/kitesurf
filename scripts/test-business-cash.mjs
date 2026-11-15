import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CASH_MOVEMENTS, CASH_SESSIONS, PRINT_PURPOSES } from '../src/lib/business/demo.ts';
import { closingSummary, expectedCashCents, reconcile, sessionTotals, thermalColumns, thermalReceipt, thermalRow, thermalWrap, validateClosing, validateMovement, validateOpening, movementsOf } from '../src/lib/business/caixa.ts';
import { buildPdf, buildXlsx, centsToDecimal, crc32 } from '../src/lib/business/files.ts';
import { closingPdfLines, closingSheetRows } from '../src/lib/business/report.ts';
import { sampleReceipt } from '../src/lib/business/receipts.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 6: cash register and closing. Demonstration data, integer cents, no payment processing.
const read = (p) => readFileSync(p, 'utf8');
const dec = new TextDecoder();

// 1. Cash maths. Only physical cash counts; Pix and card are recorded, never counted in the drawer.
const t1 = sessionTotals(movementsOf('cs-1'));
assert.equal(expectedCashCents(20000, t1), 7500, '200 + 150 cash sale + 50 supply - 300 bleed - 25 expense');
assert.equal(t1.salesPixCents, 26000); assert.equal(t1.salesTotalCents, 41000);
const withMorePix = sessionTotals([...movementsOf('cs-1'), { id: 'x', sessionId: 'cs-1', kind: 'sale', method: 'pix_external', cents: 99999, note: 'x', time: '10:00' }]);
assert.equal(expectedCashCents(20000, withMorePix), 7500, 'external payments never change the cash on hand');
const c2 = closingSummary(CASH_SESSIONS.find((s) => s.id === 'cs-2'));
assert.deepEqual([c2.expectedCents, c2.countedCents, c2.rec.differenceCents, c2.rec.status], [20000, 19500, -500, 'shortage']);
assert.equal(closingSummary(CASH_SESSIONS.find((s) => s.id === 'cs-3')).rec.status, 'ok');
assert.equal(closingSummary(CASH_SESSIONS.find((s) => s.id === 'cs-1')), null, 'an open cash register has no closing');
assert.deepEqual(reconcile(1000, 1200), { differenceCents: 200, status: 'surplus' });
for (const m of CASH_MOVEMENTS) assert.ok(Number.isInteger(m.cents) && m.cents > 0 && (m.kind !== 'sale' || m.method), m.id);
assert.equal(CASH_SESSIONS.filter((s) => !s.closing).length, 1, 'one open register per unit in the demo');

// 2. Validation.
assert.deepEqual(validateOpening({ unitId: 'u-jeri-lagoa', opening: '150,00', operator: 'Paula' }), {});
assert.ok(validateOpening({ unitId: 'u-prea', opening: '100', operator: 'Paula' }).unitId, 'unit already has an open register');
assert.ok(validateOpening({ unitId: '', opening: '1', operator: 'Paula' }).unitId);
assert.ok(validateOpening({ unitId: 'u-jeri-lagoa', opening: 'abc', operator: 'Paula' }).opening);
assert.ok(validateOpening({ unitId: 'u-jeri-lagoa', opening: '10', operator: 'P' }).operator);
assert.deepEqual(validateMovement({ kind: 'sale', method: 'pix_external', amount: '260,00', note: 'Aula' }), {});
assert.ok(validateMovement({ kind: 'sale', method: '', amount: '10', note: 'Aula' }).method, 'a sale needs the payment method');
assert.deepEqual(validateMovement({ kind: 'bleed', method: '', amount: '10', note: 'Cofre' }), {}, 'a bleed does not');
assert.ok(validateMovement({ kind: 'bleed', method: '', amount: '0', note: 'Cofre' }).amount);
assert.ok(validateMovement({ kind: 'x', method: '', amount: '10', note: 'Cofre' }).kind);
assert.deepEqual(validateClosing({ counted: '200,00', reason: '', expectedCents: 20000 }), {});
assert.ok(validateClosing({ counted: '195,00', reason: '', expectedCents: 20000 }).reason, 'a difference needs a reason');
assert.ok(validateClosing({ counted: '195,00', reason: 'curto', expectedCents: 20000 }).reason);
assert.deepEqual(validateClosing({ counted: '195,00', reason: 'Troco entregue sem registro', expectedCents: 20000 }), {});
assert.ok(validateClosing({ counted: 'x', reason: '', expectedCents: 0 }).counted);

// 3. Thermal layout: 32 columns on 58 mm, 48 on 80 mm, nothing ever wider.
assert.equal(thermalColumns(58), 32); assert.equal(thermalColumns(80), 48);
assert.deepEqual(thermalWrap('aaaa bbbb cccc', 9), ['aaaa bbbb', 'cccc']);
assert.deepEqual(thermalWrap('x'.repeat(20), 8), ['xxxxxxxx', 'xxxxxxxx', 'xxxx'], 'long words are split');
assert.equal(thermalRow('Total', 'R$ 10,00', 20).length, 20);
assert.ok(thermalRow('Um nome de item muito comprido', 'R$ 1,00', 20).length <= 20 && thermalRow('Um nome de item muito comprido', 'R$ 1,00', 20).endsWith('R$ 1,00'), 'the amount always survives');
for (const p of PRINT_PURPOSES) for (const w of [58, 80]) {
  const r = sampleReceipt(p.id, 'cs-2');
  const lines = thermalReceipt(r.title, r.rows, r.note, w).split('\n');
  assert.ok(lines.every((l) => l.length <= thermalColumns(w)), `${p.id} ${w}mm fits`);
  assert.ok(lines.some((l) => /sem valor fiscal/i.test(l)), 'receipts are not fiscal documents');
}

// 4. Files: structure verified here; also opened with openpyxl, pypdf and pdftotext when authored.
assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'standard CRC-32 check value');
assert.equal(centsToDecimal(-500), '-5.00'); assert.equal(centsToDecimal(7), '0.07'); assert.equal(centsToDecimal(100050), '1000.50');
const xlsx = buildXlsx('Fechamento', closingSheetRows(c2));
assert.deepEqual([...xlsx.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'ZIP signature');
const view = new DataView(xlsx.buffer, xlsx.byteOffset, xlsx.byteLength);
assert.equal(view.getUint32(xlsx.length - 22, true), 0x06054b50, 'end of central directory'); assert.equal(view.getUint16(xlsx.length - 12, true), 6, 'six parts');
const names = []; { let at = 0; while (view.getUint32(at, true) === 0x04034b50) { const size = view.getUint32(at + 18, true), n = view.getUint16(at + 26, true); names.push(dec.decode(xlsx.slice(at + 30, at + 30 + n))); const body = xlsx.slice(at + 30 + n, at + 30 + n + size); assert.equal(view.getUint32(at + 14, true), crc32(body), `crc of ${names.at(-1)}`); at += 30 + n + size; } }
assert.deepEqual(names, ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
const sheetXml = (() => { const z = buildXlsx('S', [['a<&>"b', { cents: 12345 }]]); return dec.decode(z); })();
assert.ok(sheetXml.includes('a&lt;&amp;&gt;&quot;b') && sheetXml.includes('<v>123.45</v>'), 'XML escaped, money from cents');
assert.ok(closingSheetRows(c2).some((r) => r[0] === 'Diferença' && r[1].cents === -500), 'sheet carries the difference');

const pdfBytes = buildPdf('T', closingPdfLines(c2)); const pdf = Buffer.from(pdfBytes).toString('latin1');
assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)[1]); assert.equal(pdf.slice(xrefAt, xrefAt + 4), 'xref', 'startxref points at the table');
const entries = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
entries.forEach((off, i) => assert.ok(pdf.slice(off).startsWith(`${i + 1} 0 obj`), `xref entry ${i + 1}`));
const many = Buffer.from(buildPdf('M', Array.from({ length: 130 }, (_, i) => `L${i}`))).toString('latin1');
assert.match(many, /\/Count 3 /, '130 lines -> 3 pages');
assert.ok(Buffer.from(buildPdf('A', ['(par) \\ ção'])).toString('latin1').includes('\\(par\\) \\\\ ç\xe3o'), 'parentheses, backslash and accents');
assert.deepEqual([...buildXlsx('Fechamento', closingSheetRows(c2))], [...buildXlsx('Fechamento', closingSheetRows(c2))], 'same data, same bytes');

// 5. Screens, menu, download route.
for (const href of ['/admin/business/caixa', '/admin/business/caixa/movimentacoes', '/admin/business/caixa/fechamentos', '/admin/business/relatorios', '/admin/business/caixa/comprovantes', '/admin/business/caixa/configuracoes']) {
  assert.ok(BUSINESS_NAV.some((i) => i.href === href) && existsSync(`src/app${href}/page.tsx`), href);
}
for (const p of ['abrir', 'movimentacoes/nova', 'fechar', 'fechamentos/[id]']) assert.ok(existsSync(`src/app/admin/business/caixa/${p}/page.tsx`), p);
const route = read('src/app/admin/business/caixa/fechamentos/[id]/arquivo/route.ts');
assert.match(route, /viewer\.role !== 'admin' \|\| !viewer\.secondFactor\) return new Response\('Acesso negado\.', \{ status: 403 \}\)/, 'route checks the Admin and second factor itself');
assert.match(route, /Cache-Control': 'no-store'/); assert.match(route, /attachment; filename=/);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk('src/app/admin/business/caixa').concat(walk('src/lib/business')).filter((x) => /\.tsx?$/.test(x))) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // comments may mention what the module does NOT do
  assert.doesNotMatch(code, /\bcharge\w*\(|\btransfer\(|createPayment|stripe|mercadopago|fetch\(/i, `${f}: no payment processing or network calls`);
}
console.log('PASS: Business cash: integer-cent maths (external Pix/card never in the drawer), validation, 58/80 mm layouts, valid xlsx/pdf structure, admin-only download');
